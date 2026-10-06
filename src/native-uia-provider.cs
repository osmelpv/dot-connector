// Source-only prototype. No entry point; compile does not execute UI Automation.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;
using System.Windows.Automation.Text;

namespace DotConnector.Native {
  public sealed class Target {
    public string hwnd { get; set; }
    public int pid { get; set; }
    public string startTimeTicks { get; set; }
    // Exact RawView runtime-ID ancestry, including the HWND root and terminal leaf.
    public int[][] panePath { get; set; }
  }
  public sealed class Observation {
    public Target target { get; set; }
    public long capturedAtMs { get; set; }
    public string foregroundHwnd { get; set; }
    public int[][] focusedPanePath { get; set; }
  }
  public sealed class VisibleRange {
    public string text { get; set; }
    public bool visible { get; set; }
  }
  public sealed class VisibleResponse {
    public Target target { get; set; }
    public long capturedAtMs { get; set; }
    public string source { get; set; }
    public VisibleRange[] ranges { get; set; }
    public bool truncated { get; set; }
  }
  public sealed class NativeReadException : Exception {
    public string Code { get; private set; }
    public int? Win32Error { get; private set; }
    public NativeReadException(string code, int? win32Error=null) : base("Native read refused.") { Code=code; Win32Error=win32Error; }
  }
  public static class ReadOnlyProvider {
    [ThreadStatic] static string stage;

    const int MaxNodes = 256;
    const int MaxAgeMs = 1000;
    static long Now() { return (DateTime.UtcNow.Ticks - 621355968000000000L) / 10000; }
    static void Require(bool value) { if (!value) throw new InvalidOperationException(); }
    static Target Copy(Target value) {
      Require(value != null && value.pid > 0 && value.panePath != null && value.panePath.Length > 0 && value.panePath.Length <= 16);
      long hwnd, ticks;
      Require(Int64.TryParse(value.hwnd, NumberStyles.None, CultureInfo.InvariantCulture, out hwnd) && hwnd > 0 && hwnd.ToString(CultureInfo.InvariantCulture) == value.hwnd);
      Require(Int64.TryParse(value.startTimeTicks, NumberStyles.None, CultureInfo.InvariantCulture, out ticks) && ticks > 0 && ticks.ToString(CultureInfo.InvariantCulture) == value.startTimeTicks);
      foreach (int[] id in value.panePath) Require(id != null && id.Length > 0 && id.Length <= 32);
      return new Target { hwnd=value.hwnd, pid=value.pid, startTimeTicks=value.startTimeTicks, panePath=value.panePath.Select(id => (int[])id.Clone()).ToArray() };
    }
    static IntPtr Handle(Target target) { return new IntPtr(Int64.Parse(target.hwnd, CultureInfo.InvariantCulture)); }
    static void Fresh(Stopwatch elapsed) { if(elapsed.ElapsedMilliseconds > MaxAgeMs) throw new NativeReadException("OBSERVATION_EXPIRED"); }
    static bool Same(int[] a, int[] b) { return a != null && b != null && a.SequenceEqual(b); }
    static string CleanUtf16(string text, bool mayTrimEnd, out bool trimmed) {
      trimmed=false;
      for(int i=0;i<text.Length;i++) {
        if(Char.IsHighSurrogate(text[i])) {
          if(i==text.Length-1 && mayTrimEnd) { trimmed=true; return text.Substring(0,text.Length-1); }
          Require(++i<text.Length && Char.IsLowSurrogate(text[i]));
        } else Require(!Char.IsLowSurrogate(text[i]));
      }
      return text;
    }

    // Only query handles: no token changes, elevation, input, focus or desktop switching.
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, uint length, out uint needed);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, uint length, out uint needed);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);

    static void CheckIntegrity(int pid, string scope) {
      stage=scope+"_PROCESS_ACCESS_REFUSED";
      IntPtr process=OpenProcess(0x1000, false, (uint)pid), token=IntPtr.Zero, data=IntPtr.Zero;
      try {
        if(process==IntPtr.Zero)throw new NativeReadException(stage,Marshal.GetLastWin32Error());
        stage=scope+"_TOKEN_OPEN_REFUSED";
        if(!OpenProcessToken(process,8,out token))throw new NativeReadException(stage,Marshal.GetLastWin32Error());
        data=Marshal.AllocHGlobal(4);uint needed;
        stage=scope+"_ELEVATION_QUERY_REFUSED";
        if(!GetTokenInformation(token,20,data,4,out needed))throw new NativeReadException(stage,Marshal.GetLastWin32Error());
        Require(needed==4);stage=scope+"_ELEVATED";Require(Marshal.ReadInt32(data)==0);
        Marshal.FreeHGlobal(data);data=IntPtr.Zero;
        stage=scope+"_INTEGRITY_SIZE_QUERY_REFUSED";
        bool sized=GetTokenInformation(token,25,IntPtr.Zero,0,out needed);int sizeError=sized?0:Marshal.GetLastWin32Error();
        if(sized||sizeError!=122)throw new NativeReadException(stage,sizeError);
        Require(needed>=IntPtr.Size && needed<=4096);uint capacity=needed;data=Marshal.AllocHGlobal((int)capacity);
        stage=scope+"_INTEGRITY_QUERY_REFUSED";
        if(!GetTokenInformation(token,25,data,capacity,out needed))throw new NativeReadException(stage,Marshal.GetLastWin32Error());
        Require(needed<=capacity);
        IntPtr sid=Marshal.ReadIntPtr(data); byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
        stage=scope+"_INTEGRITY_ABOVE_MEDIUM";Require(count > 0 && unchecked((uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count-1)))) <= 0x2000);
      } finally {
        if(data!=IntPtr.Zero) Marshal.FreeHGlobal(data);
        if(token!=IntPtr.Zero) CloseHandle(token);
        if(process!=IntPtr.Zero) CloseHandle(process);
      }
    }
    public static void CheckOwnIntegrityForTest() {
      using(Process own=Process.GetCurrentProcess())CheckIntegrity(own.Id,"READER");
    }
    public static void AssertManualEmptyPrompt(Target requested) { AssertManualPrompt(requested, ""); }
    public static void AssertManualPrompt(Target requested, string pending) {
      try {
        Require(pending!=null && pending.Length<=256);string expectedText="DOT_WRITE_READY> "+pending;
        stage="MANUAL_EMPTY_PROMPT_REQUIRED";var elapsed=Stopwatch.StartNew();Target target=Copy(requested);
        AutomationElement pane=Resolve(target,elapsed);object value;
        stage="UIA_TEXT_PATTERN_UNAVAILABLE";Require(pane.TryGetCurrentPattern(TextPattern.Pattern,out value));
        var pattern=(TextPattern)value;var selection=pattern.GetSelection();stage="MANUAL_SELECTION_NOT_EMPTY";
        Require(selection!=null && selection.Length==1 && selection[0].CompareEndpoints(TextPatternRangeEndpoint.Start,selection[0],TextPatternRangeEndpoint.End)==0);
        var visible=pattern.GetVisibleRanges();stage="MANUAL_CARET_NOT_VISIBLE";
        Require(visible!=null && visible.Length<=64 && visible.Any(range=>range.CompareEndpoints(TextPatternRangeEndpoint.Start,selection[0],TextPatternRangeEndpoint.Start)<=0 && range.CompareEndpoints(TextPatternRangeEndpoint.End,selection[0],TextPatternRangeEndpoint.Start)>=0));
        var line=selection[0].Clone();line.ExpandToEnclosingUnit(TextUnit.Line);
        stage="MANUAL_EMPTY_PROMPT_REQUIRED";Require(line.GetText(512).TrimEnd(' ','\r','\n')==expectedText.TrimEnd(' '));
        var expected=line.Clone();expected.MoveEndpointByRange(TextPatternRangeEndpoint.End,line,TextPatternRangeEndpoint.Start);
        Require(expected.MoveEndpointByUnit(TextPatternRangeEndpoint.End,TextUnit.Character,expectedText.Length)==expectedText.Length);
        Require(expected.CompareEndpoints(TextPatternRangeEndpoint.End,selection[0],TextPatternRangeEndpoint.Start)==0);
        Resolve(target,elapsed);CheckWindow(target);Fresh(elapsed);
      }catch(NativeReadException){throw;}catch{throw new NativeReadException(stage ?? "MANUAL_INPUT_GUARD_REFUSED");}
    }
    static void CheckWindow(Target target) {
      IntPtr hwnd=Handle(target); uint actualPid;
      stage="WINDOW_PID_MISMATCH";Require(GetWindowThreadProcessId(hwnd, out actualPid)!=0 && actualPid==(uint)target.pid);
      stage="FOREGROUND_MISMATCH";Require(GetForegroundWindow()==hwnd);stage="WINDOW_NOT_VISIBLE";Require(IsWindowVisible(hwnd) && !IsIconic(hwnd));
      using(Process process=Process.GetProcessById(target.pid)) {
        stage="PROCESS_START_CHANGED";Require(process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture)==target.startTimeTicks);
        stage="TARGET_PROCESS_UNSUPPORTED";Require(process.ProcessName=="WindowsTerminal" || process.ProcessName=="OpenConsole" || process.ProcessName=="conhost");
      }
      CheckIntegrity(target.pid,"TARGET");
      using(Process current=Process.GetCurrentProcess()) CheckIntegrity(current.Id,"READER");
      stage="DESKTOP_ACCESS_REFUSED";IntPtr desktop=OpenInputDesktop(0, false, 1); // DESKTOP_READOBJECTS only
      try {
        Require(desktop!=IntPtr.Zero); var name=new StringBuilder(256); uint needed;
        Require(GetUserObjectInformation(desktop, 2, name, 512, out needed));stage="NONDEFAULT_DESKTOP";Require(name.ToString()=="Default");
      } finally { if(desktop!=IntPtr.Zero) CloseDesktop(desktop); }
    }
    static AutomationElement Resolve(Target target, Stopwatch elapsed) {
      CheckWindow(target); Fresh(elapsed);
      stage="UIA_ROOT_UNAVAILABLE";AutomationElement element=AutomationElement.FromHandle(Handle(target));
      Require(element!=null);stage="UIA_ROOT_IDENTITY_MISMATCH";Require(Same(element.GetRuntimeId(), target.panePath[0]));
      int nodes=0;
      for(int depth=1;depth<target.panePath.Length;depth++) {
        stage="UIA_ANCESTRY_MISSING_OR_AMBIGUOUS";AutomationElement match=null;
        for(AutomationElement child=TreeWalker.RawViewWalker.GetFirstChild(element);child!=null;child=TreeWalker.RawViewWalker.GetNextSibling(child)) {
          Require(++nodes <= MaxNodes); Fresh(elapsed);
          if(Same(child.GetRuntimeId(),target.panePath[depth])) { Require(match==null); match=child; }
        }
        Require(match!=null); element=match;
      }
      stage="UIA_PANE_PROCESS_MISMATCH";Require(element.Current.ProcessId==target.pid);
      stage="UIA_PANE_OFFSCREEN";Require(!element.Current.IsOffscreen);
      stage="UIA_PASSWORD_ELEMENT";Require(!element.Current.IsPassword);
      stage="UIA_PANE_NOT_FOCUSED";Require(element.Current.HasKeyboardFocus);
      stage="UIA_FOCUS_CHANGED";AutomationElement focused=AutomationElement.FocusedElement;
      Require(focused!=null && Same(focused.GetRuntimeId(),element.GetRuntimeId()));
      Fresh(elapsed); return element;
    }
    // Manual-test entry only: user deliberately focuses one synthetic-text terminal.
    // No window enumeration, title matching, activation or input is performed.
    public static Target BindForegroundForManualTest() {
      try {
        stage="FOREGROUND_TARGET_UNAVAILABLE";var elapsed=Stopwatch.StartNew();IntPtr hwnd=GetForegroundWindow();uint pid=0;
        Require(hwnd!=IntPtr.Zero && GetWindowThreadProcessId(hwnd,out pid)!=0 && pid>0 && pid<=Int32.MaxValue);
        Target target;
        using(Process process=Process.GetProcessById((int)pid)) target=new Target {hwnd=hwnd.ToInt64().ToString(CultureInfo.InvariantCulture),pid=(int)pid,startTimeTicks=process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture)};
        CheckWindow(target);Fresh(elapsed);
        stage="UIA_FOCUSED_ELEMENT_UNAVAILABLE";AutomationElement root=AutomationElement.FromHandle(hwnd), element=AutomationElement.FocusedElement;
        Require(root!=null && element!=null && element.Current.ProcessId==target.pid);
        stage="UIA_FOCUSED_ANCESTRY_UNRESOLVED";int[] rootId=root.GetRuntimeId();var ancestry=new List<int[]>();bool found=false;
        for(int depth=0;depth<16 && element!=null;depth++) {
          Fresh(elapsed);int[] id=element.GetRuntimeId();Require(id!=null && id.Length>0 && id.Length<=32);ancestry.Add(id);
          if(Same(id,rootId)){found=true;break;}
          element=TreeWalker.RawViewWalker.GetParent(element);
        }
        Require(found);ancestry.Reverse();target.panePath=ancestry.ToArray();target=Copy(target);
        Resolve(target,elapsed);CheckWindow(target);Fresh(elapsed);return target;
      } catch(NativeReadException){throw;} catch {throw new NativeReadException(stage ?? "NATIVE_BIND_REFUSED");}
    }
    public static Observation Observe(Target requested) {
      try {
        stage="REQUEST_IDENTITY_INVALID";var elapsed=Stopwatch.StartNew(); Target target=Copy(requested);
        Resolve(target,elapsed); CheckWindow(target); Fresh(elapsed);
        return new Observation {target=target,capturedAtMs=Now(),foregroundHwnd=target.hwnd,focusedPanePath=target.panePath};
      } catch(NativeReadException){throw;} catch {throw new NativeReadException(stage ?? "NATIVE_OBSERVATION_REFUSED");}
    }
    public static VisibleResponse GetVisibleRanges(Target requested, int maxRanges, int maxCharacters) {
      try {
        stage="REQUEST_IDENTITY_INVALID";var elapsed=Stopwatch.StartNew(); Target target=Copy(requested);
        Require(maxRanges>0 && maxRanges<=64 && maxCharacters>0 && maxCharacters<=16000);
        AutomationElement pane=Resolve(target,elapsed); object pattern;
        stage="UIA_TEXT_PATTERN_UNAVAILABLE";Require(pane.TryGetCurrentPattern(TextPattern.Pattern,out pattern));
        stage="UIA_VISIBLE_RANGES_FAILED";var visible=((TextPattern)pattern).GetVisibleRanges();
        Require(visible!=null && visible.Length<=maxRanges); Fresh(elapsed);
        var result=new List<VisibleRange>(); int remaining=maxCharacters; bool truncated=false;
        for(int i=0;i<visible.Length;i++) {
          if(remaining==0) { truncated=true; break; }
          stage="UIA_VISIBLE_TEXT_FAILED";string text=visible[i].GetText(remaining); Require(text!=null && text.Length<=remaining);
          int consumed=text.Length; bool trimmed;
          text=CleanUtf16(text,consumed==remaining,out trimmed);
          remaining-=consumed; result.Add(new VisibleRange {text=text,visible=true});
          // Conservative: an exactly full range may or may not contain more characters.
          if(remaining==0 || trimmed) truncated=true;
          Fresh(elapsed);
        }
        Resolve(target,elapsed); CheckWindow(target); Fresh(elapsed);
        return new VisibleResponse {target=target,capturedAtMs=Now(),source="TextPattern.GetVisibleRanges",ranges=result.ToArray(),truncated=truncated};
      } catch(NativeReadException){throw;} catch {throw new NativeReadException(stage ?? "NATIVE_VISIBLE_READ_REFUSED");}
    }
  }
}
