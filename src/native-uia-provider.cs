// Source-only prototype. No entry point; compile does not execute UI Automation.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

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
  public static class ReadOnlyProvider {
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
    static void Fresh(Stopwatch elapsed) { Require(elapsed.ElapsedMilliseconds <= MaxAgeMs); }
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
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, uint length, out uint needed);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);

    static void CheckIntegrity(int pid) {
      IntPtr process=OpenProcess(0x1000, false, (uint)pid), token=IntPtr.Zero, data=IntPtr.Zero;
      try {
        Require(process != IntPtr.Zero && OpenProcessToken(process, 8, out token));
        data=Marshal.AllocHGlobal(4096); uint needed;
        Require(GetTokenInformation(token, 20, data, 4096, out needed) && Marshal.ReadInt32(data)==0);
        Require(GetTokenInformation(token, 25, data, 4096, out needed));
        IntPtr sid=Marshal.ReadIntPtr(data); byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
        Require(count > 0 && unchecked((uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count-1)))) <= 0x2000);
      } finally {
        if(data!=IntPtr.Zero) Marshal.FreeHGlobal(data);
        if(token!=IntPtr.Zero) CloseHandle(token);
        if(process!=IntPtr.Zero) CloseHandle(process);
      }
    }
    static void CheckWindow(Target target) {
      IntPtr hwnd=Handle(target); uint actualPid;
      Require(GetWindowThreadProcessId(hwnd, out actualPid)!=0 && actualPid==(uint)target.pid);
      Require(GetForegroundWindow()==hwnd && IsWindowVisible(hwnd) && !IsIconic(hwnd));
      using(Process process=Process.GetProcessById(target.pid)) {
        Require(process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture)==target.startTimeTicks);
        Require(process.ProcessName=="WindowsTerminal" || process.ProcessName=="OpenConsole" || process.ProcessName=="conhost");
      }
      CheckIntegrity(target.pid);
      using(Process current=Process.GetCurrentProcess()) CheckIntegrity(current.Id);
      IntPtr desktop=OpenInputDesktop(0, false, 1); // DESKTOP_READOBJECTS only
      try {
        Require(desktop!=IntPtr.Zero); var name=new StringBuilder(256); uint needed;
        Require(GetUserObjectInformation(desktop, 2, name, 512, out needed) && name.ToString()=="Default");
      } finally { if(desktop!=IntPtr.Zero) CloseDesktop(desktop); }
    }
    static AutomationElement Resolve(Target target, Stopwatch elapsed) {
      CheckWindow(target); Fresh(elapsed);
      AutomationElement element=AutomationElement.FromHandle(Handle(target));
      Require(element!=null && Same(element.GetRuntimeId(), target.panePath[0]));
      int nodes=0;
      for(int depth=1;depth<target.panePath.Length;depth++) {
        AutomationElement match=null;
        for(AutomationElement child=TreeWalker.RawViewWalker.GetFirstChild(element);child!=null;child=TreeWalker.RawViewWalker.GetNextSibling(child)) {
          Require(++nodes <= MaxNodes); Fresh(elapsed);
          if(Same(child.GetRuntimeId(),target.panePath[depth])) { Require(match==null); match=child; }
        }
        Require(match!=null); element=match;
      }
      Require(element.Current.ProcessId==target.pid && !element.Current.IsOffscreen && !element.Current.IsPassword && element.Current.HasKeyboardFocus);
      AutomationElement focused=AutomationElement.FocusedElement;
      Require(focused!=null && Same(focused.GetRuntimeId(),element.GetRuntimeId()));
      Fresh(elapsed); return element;
    }
    public static Observation Observe(Target requested) {
      try {
        var elapsed=Stopwatch.StartNew(); Target target=Copy(requested);
        Resolve(target,elapsed); CheckWindow(target); Fresh(elapsed);
        return new Observation {target=target,capturedAtMs=Now(),foregroundHwnd=target.hwnd,focusedPanePath=target.panePath};
      } catch { throw new InvalidOperationException("Native observation refused; no fallback or elevation."); }
    }
    public static VisibleResponse GetVisibleRanges(Target requested, int maxRanges, int maxCharacters) {
      try {
        var elapsed=Stopwatch.StartNew(); Target target=Copy(requested);
        Require(maxRanges>0 && maxRanges<=64 && maxCharacters>0 && maxCharacters<=16000);
        AutomationElement pane=Resolve(target,elapsed); object pattern;
        Require(pane.TryGetCurrentPattern(TextPattern.Pattern,out pattern));
        var visible=((TextPattern)pattern).GetVisibleRanges();
        Require(visible!=null && visible.Length<=maxRanges); Fresh(elapsed);
        var result=new List<VisibleRange>(); int remaining=maxCharacters; bool truncated=false;
        for(int i=0;i<visible.Length;i++) {
          if(remaining==0) { truncated=true; break; }
          string text=visible[i].GetText(remaining); Require(text!=null && text.Length<=remaining);
          int consumed=text.Length; bool trimmed;
          text=CleanUtf16(text,consumed==remaining,out trimmed);
          remaining-=consumed; result.Add(new VisibleRange {text=text,visible=true});
          // Conservative: an exactly full range may or may not contain more characters.
          if(remaining==0 || trimmed) truncated=true;
          Fresh(elapsed);
        }
        Resolve(target,elapsed); CheckWindow(target); Fresh(elapsed);
        return new VisibleResponse {target=target,capturedAtMs=Now(),source="TextPattern.GetVisibleRanges",ranges=result.ToArray(),truncated=truncated};
      } catch { throw new InvalidOperationException("Native visible read refused; no fallback or elevation."); }
    }
  }
}
