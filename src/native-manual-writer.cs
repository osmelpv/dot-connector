// User-run fixed-marker experiment only. Never invoke --read from the agent.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using DotConnector.Native;
public static class ManualWriter {
  const string Marker="DOT_WRITE_TEST";
  [StructLayout(LayoutKind.Sequential)] struct KeyboardInput {public ushort virtualKey;public ushort scan;public uint flags;public uint time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Explicit,Size=40)] struct Input {[FieldOffset(0)]public uint type;[FieldOffset(8)]public KeyboardInput keyboard;}
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,Input[] input,int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  static void Require(bool value,string code){if(!value)throw new NativeReadException(code);}
  static long Now(){return (DateTime.UtcNow.Ticks-621355968000000000L)/10000;}
  static Input[] Inputs(){var result=new List<Input>();foreach(char c in Marker){result.Add(new Input {type=1,keyboard=new KeyboardInput {scan=c,flags=4}});result.Add(new Input {type=1,keyboard=new KeyboardInput {scan=c,flags=6}});}return result.ToArray();}
  static Dictionary<string,object> Object(object value,params string[] keys){var d=value as Dictionary<string,object>;Require(d!=null && d.Keys.OrderBy(k=>k).SequenceEqual(keys.OrderBy(k=>k)),"INVALID_REQUEST");return d;}
  static bool MatchingLine(string text,string line){return text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).Any(v=>v.TrimEnd(' ')==line);}
  static uint WindowThread(Target target){uint pid=0;var hwnd=new IntPtr(Int64.Parse(target.hwnd,CultureInfo.InvariantCulture));uint thread=GetWindowThreadProcessId(hwnd,out pid);Require(thread!=0 && pid==target.pid && GetForegroundWindow()==hwnd,"FOREGROUND_CHANGED_NO_RETRY");return thread;}
  public static int Main(string[] argv){
    string phase="NOT_DISPATCHED";
    try {
      Console.InputEncoding=new UTF8Encoding(false,true);Console.OutputEncoding=new UTF8Encoding(false,true);
      Require(Environment.Is64BitProcess && Marshal.SizeOf(typeof(Input))==40,"UNSUPPORTED_INPUT_LAYOUT");
      Require(argv.Length==1 && (argv[0]=="--read"||argv[0]=="--validate-only"||argv[0]=="--self-test"),"INVALID_MODE");
      if(argv[0]=="--self-test"){
        var inputs=Inputs();Require(inputs.Length==Marker.Length*2 && inputs.All(i=>i.type==1 && i.keyboard.virtualKey==0 && i.keyboard.scan>=32 && i.keyboard.scan<=126 && (i.keyboard.flags==4||i.keyboard.flags==6)),"INPUT_LAYOUT_TEST_FAILED");
        Require(!Marker.Contains("\r")&&!Marker.Contains("\n"),"INPUT_TEXT_TEST_FAILED");Console.Write("{\"passed\":true,\"inputEvents\":28,\"uiAutomationCalls\":false,\"sendInputCalls\":false}");return 0;
      }
      var data=new StringBuilder();int c;while((c=Console.In.Read())!=-1){Require(data.Length<4096,"REQUEST_LIMIT");data.Append((char)c);}
      var json=new JavaScriptSerializer {MaxJsonLength=4096,RecursionLimit=8};
      var r=Object(json.DeserializeObject(data.ToString()),"method","arguments");Require((r["method"] as string)=="manualWrite","INVALID_METHOD");
      var a=Object(r["arguments"],"armed","expiresAtMs","operationId");Require(a["armed"] is bool && (bool)a["armed"],"HUMAN_ENABLE_REQUIRED");
      Require(a["expiresAtMs"] is long || a["expiresAtMs"] is int,"INVALID_EXPIRY");long expires=Convert.ToInt64(a["expiresAtMs"],CultureInfo.InvariantCulture);
      Guid operation=Guid.Empty;Require(a["operationId"] is string && Guid.TryParseExact((string)a["operationId"],"D",out operation),"INVALID_OPERATION");
      Require(expires>Now()&&expires<=Now()+15000,"HUMAN_ENABLE_EXPIRED");
      if(argv[0]=="--validate-only"){Console.Write("{\"validated\":true,\"uiAutomationCalls\":false,\"sendInputCalls\":false}");return 0;}
      string directory=AppDomain.CurrentDomain.BaseDirectory;
      var pin=Object(json.DeserializeObject(File.ReadAllText(Path.Combine(directory,"target.json"))),"hwnd","pid","startTimeTicks");
      Target target=ReadOnlyProvider.BindForegroundForManualTest();
      Require((pin["hwnd"] as string)==target.hwnd && pin["pid"] is int && (int)pin["pid"]==target.pid && (pin["startTimeTicks"] as string)==target.startTimeTicks,"PINNED_TARGET_CHANGED");
      uint thread=WindowThread(target);
      var before=ReadOnlyProvider.GetVisibleRanges(target,64,16000);string text=String.Concat(before.ranges.Select(range=>range.text));
      Require(!before.truncated && MatchingLine(text,"DOT_NATIVE_TEST_7F3A2C9B"),"SYNTHETIC_TARGET_MARKER_REQUIRED");
      Require(text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).Where(line=>!String.IsNullOrWhiteSpace(line)).Last().TrimEnd(' ')=="DOT_WRITE_READY>","PENDING_INPUT_OR_UNKNOWN_PROMPT");
      ReadOnlyProvider.AssertManualEmptyPrompt(target);
      // One attempt per prepared artifact, including concurrent users/processes.
      // Never auto-remove: failure after this point requires inspection before rearming.
      using(var gate=new FileStream(Path.Combine(directory,"manual-write-attempt.lock"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] bytes=Encoding.UTF8.GetBytes(operation.ToString("D"));gate.Write(bytes,0,bytes.Length);gate.Flush(true);}
      using(var journal=new FileStream(Path.Combine(directory,"attempt-"+operation.ToString("D")+".json"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] bytes=Encoding.UTF8.GetBytes("{\"state\":\"attempted\"}");journal.Write(bytes,0,bytes.Length);journal.Flush(true);}
      ReadOnlyProvider.AssertManualEmptyPrompt(target);
      foreach(int key in new[]{1,2,4,5,6,16,17,18,27,91,92,160,161,162,163,164,165})Require((GetAsyncKeyState(key)&0x8000)==0,"KEY_OR_MOUSE_HELD_CANCELLED");
      Require(expires>Now(),"HUMAN_ENABLE_EXPIRED");Require(WindowThread(target)==thread,"WINDOW_THREAD_CHANGED");
      var events=Inputs();phase="DISPATCH_OUTCOME_UNKNOWN";
      uint sent=SendInput((uint)events.Length,events,Marshal.SizeOf(typeof(Input)));int code=sent==events.Length?0:Marshal.GetLastWin32Error();
      if(sent!=events.Length){Console.Write(json.Serialize(new {result="FAIL",diagnostic="PARTIAL_OR_ZERO_SEND_NO_RETRY",phase=phase,eventsInserted=sent,win32Error=code}));return 0;}
      phase="DISPATCHED_NO_ENTER";
      ReadOnlyProvider.Observe(target);var after=ReadOnlyProvider.GetVisibleRanges(target,64,16000);
      bool confirmed=MatchingLine(String.Concat(after.ranges.Select(range=>range.text)),"DOT_WRITE_READY> "+Marker);
      Console.Write(json.Serialize(new {result=confirmed?"PASS":"FAIL",diagnostic=confirmed?"PENDING_MARKER_VISIBLE_NO_ENTER":"DISPATCHED_BUT_NOT_CONFIRMED_NO_RETRY",phase=phase,hwnd=target.hwnd,pid=target.pid,eventsInserted=sent}));return 0;
    }catch(NativeReadException e){Console.Write(new JavaScriptSerializer().Serialize(new {result="FAIL",diagnostic=e.Code,phase=phase,win32Error=e.Win32Error}));return 0;}
    catch{Console.Write(new JavaScriptSerializer().Serialize(new {result="FAIL",diagnostic="MANUAL_WRITE_REFUSED_NO_RETRY",phase=phase}));return 0;}
  }
}
