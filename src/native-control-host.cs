#if OWNER_IDENTITY
// Read-only identity of the Node caller supplied by the trusted JS adapter.
// No UIA, input, process enumeration, elevation, token duplication or network.
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Web.Script.Serialization;
public static class NativeOwner {
 [StructLayout(LayoutKind.Sequential)] struct FT {public uint low,high;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr p,out FT c,out FT e,out FT k,out FT u);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr p,uint ms);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,out int data,int size,out int needed);
 static void Need(bool value){if(!value)throw new InvalidOperationException();}
 public static int Main(string[] args){
  IntPtr p=IntPtr.Zero,t=IntPtr.Zero;
  try{
   int pid;Need(args.Length==1&&Int32.TryParse(args[0],NumberStyles.None,CultureInfo.InvariantCulture,out pid));
   pid=Int32.Parse(args[0],CultureInfo.InvariantCulture);Need(pid>0&&pid.ToString(CultureInfo.InvariantCulture)==args[0]);
   p=OpenProcess(0x1000|0x100000,false,(uint)pid);Need(p!=IntPtr.Zero&&WaitForSingleObject(p,0)==258);
   FT c,e,k,u;Need(GetProcessTimes(p,out c,out e,out k,out u));Need(OpenProcessToken(p,8,out t));
   int session,needed;Need(GetTokenInformation(t,12,out session,4,out needed)&&needed==4&&session>=0);
   string sid;using(var identity=new WindowsIdentity(t)){sid=identity.User.Value;}
   long ticks=checked((long)(((ulong)c.high<<32)|c.low)+504911232000000000L);
   Need(WaitForSingleObject(p,0)==258);
   Console.Write(new JavaScriptSerializer().Serialize(new{pid=pid,startTimeTicks=ticks.ToString(CultureInfo.InvariantCulture),userSid=sid,sessionId=session}));return 0;
  }catch{Console.Error.Write("OWNER_IDENTITY_UNAVAILABLE");return 1;}
  finally{if(t!=IntPtr.Zero)CloseHandle(t);if(p!=IntPtr.Zero)CloseHandle(p);}
 }
}

#else
// Human-operated MCP test host. Native calls require an explicit manual-integration build.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using DotConnector.Native;

public static class NativeControlHost {
  static void Require(bool ok) { if(!ok) throw new InvalidOperationException(); }
  static Dictionary<string,object> Fields(object value, params string[] names) {
    var fields=value as Dictionary<string,object>;
    Require(fields!=null && fields.Keys.OrderBy(k=>k).SequenceEqual(names.OrderBy(k=>k)));
    return fields;
  }
  static int Integer(object value,int min,int max) {
    Require(value is int);int n=(int)value;Require(n>=min && n<=max);return n;
  }
  static string Decimal(object value) {
    Require(value is string);string s=(string)value;long n;
    Require(Int64.TryParse(s,NumberStyles.None,CultureInfo.InvariantCulture,out n) && n>0 && n.ToString(CultureInfo.InvariantCulture)==s);return s;
  }
  static Target TargetFrom(object value) {
    var f=Fields(value,"hwnd","pid","startTimeTicks","panePath");
    var path=f["panePath"] as object[];Require(path!=null && path.Length>0 && path.Length<=16);
    var ids=new List<int[]>();
    foreach(object part in path){var id=part as object[];Require(id!=null && id.Length>0 && id.Length<=32);ids.Add(id.Select(n=>Integer(n,Int32.MinValue,Int32.MaxValue)).ToArray());}
    return new Target {hwnd=Decimal(f["hwnd"]),pid=Integer(f["pid"],1,Int32.MaxValue),startTimeTicks=Decimal(f["startTimeTicks"]),panePath=ids.ToArray()};
  }

  [StructLayout(LayoutKind.Sequential)] struct KeyboardInput {public ushort virtualKey;public ushort scan;public uint flags;public uint time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Explicit,Size=40)] struct Input {[FieldOffset(0)]public uint type;[FieldOffset(8)]public KeyboardInput keyboard;}
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,Input[] input,int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  static long Now(){return (DateTime.UtcNow.Ticks-621355968000000000L)/10000;}
  static Input[] Events(string kind,string text){if(kind=="submit")return new[]{new Input{type=1,keyboard=new KeyboardInput{virtualKey=13,flags=0}},new Input{type=1,keyboard=new KeyboardInput{virtualKey=13,flags=2}}};var events=new List<Input>();foreach(char c in text){events.Add(new Input{type=1,keyboard=new KeyboardInput{scan=c,flags=4}});events.Add(new Input{type=1,keyboard=new KeyboardInput{scan=c,flags=6}});}return events.ToArray();}
  static string Visible(Target target){var r=ReadOnlyProvider.GetVisibleRanges(target,64,16000);Require(!r.truncated);return String.Concat(r.ranges.Select(x=>x.text));}
  static bool Line(string text,string line){return text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).Any(x=>x.TrimEnd(' ')==line);}
  static void Grant(JavaScriptSerializer json,string operation,string kind,string text,long expiry){
    var g=Fields(json.DeserializeObject(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"control.json"))),"paused","operationId","kind","text","expiresAtMs");
    Require(g["paused"] is bool && !(bool)g["paused"] && (g["operationId"] as string)==operation && (g["kind"] as string)==kind && (g["text"] as string)==text);
    Require(Convert.ToInt64(g["expiresAtMs"],CultureInfo.InvariantCulture)==expiry && expiry>Now() && expiry<=Now()+15000);
  }
  public static int Main(string[] argv){
    string phase="NOT_DISPATCHED";
    try{
      Require(argv.Length==1 && (argv[0]=="--read"||argv[0]=="--validate-only"||argv[0]=="--self-test"));
      Require(Environment.Is64BitProcess && Marshal.SizeOf(typeof(Input))==40);
      Console.InputEncoding=new UTF8Encoding(false,true);Console.OutputEncoding=new UTF8Encoding(false,true);
      var json=new JavaScriptSerializer{MaxJsonLength=16000,RecursionLimit=64};
      if(argv[0]=="--self-test") {var p=Events("paste","DOT_WRITE_TEST");var s=Events("submit","");Require(p.Length==28 && p.All(x=>x.keyboard.scan!=13) && s.Length==2 && s.All(x=>x.keyboard.virtualKey==13 && x.keyboard.scan==0));Console.Write("{\"passed\":true,\"nativeCalls\":false}");return 0;}
      var input=new StringBuilder();int c;while((c=Console.In.Read())!=-1){Require(input.Length<16000);input.Append((char)c);}
      var request=Fields(json.DeserializeObject(input.ToString()),"method","arguments");string method=request["method"] as string;
      Target target=null;string operation=null,kind=null,text=null;long expiry=0;int maxRanges=0,maxCharacters=0;
      if(method=="selectManualTarget")Fields(request["arguments"]);
      else if(method=="nativeWrite"){
        var a=Fields(request["arguments"],"target","operationId","kind","text","expiresAtMs");target=TargetFrom(a["target"]);
        operation=a["operationId"] as string;kind=a["kind"] as string;text=a["text"] as string;
        Require(operation!=null && System.Text.RegularExpressions.Regex.IsMatch(operation,@"\A[a-zA-Z0-9_-]{1,80}\z"));
        Require((kind=="paste"||kind=="submit") && text!=null && text.Length<=256 && (kind!="paste"||text.Length>0));
        for(int i=0;i<text.Length;i++){char ch=text[i];Require(!Char.IsControl(ch)&&ch!='\u2028'&&ch!='\u2029');if(Char.IsHighSurrogate(ch)){Require(i+1<text.Length && Char.IsLowSurrogate(text[++i]));}else Require(!Char.IsLowSurrogate(ch));}
        Require(a["expiresAtMs"] is long || a["expiresAtMs"] is int);expiry=Convert.ToInt64(a["expiresAtMs"],CultureInfo.InvariantCulture);Require(expiry>Now() && expiry<=Now()+15000);
      }else{
        Require(method=="observe"||method=="getVisibleRanges");
        var a=method=="observe"?Fields(request["arguments"],"target","identityOnly"):Fields(request["arguments"],"target","maxRanges","maxCharacters","source");target=TargetFrom(a["target"]);
        if(method=="observe")Require(a["identityOnly"] is bool && (bool)a["identityOnly"]);
        else{maxRanges=Integer(a["maxRanges"],1,64);maxCharacters=Integer(a["maxCharacters"],1,16000);Require((a["source"] as string)=="TextPattern.GetVisibleRanges");}
      }
      if(argv[0]=="--validate-only"){Console.Write(json.Serialize(new{validated=true,method=method,nativeCalls=false}));return 0;}
#if MANUAL_NATIVE_INTEGRATION
      object result;
      if(method=="selectManualTarget"){
        target=ReadOnlyProvider.BindForegroundForManualTest();Require(Line(Visible(target),"DOT_NATIVE_TEST_7F3A2C9B"));result=target;
      }else if(method=="observe") result=ReadOnlyProvider.Observe(target);
      else if(method=="getVisibleRanges")result=ReadOnlyProvider.GetVisibleRanges(target,maxRanges,maxCharacters);
      else{
        bool held=false;
        using(var mutex=new Mutex(false,"Local\\DotConnectorNative-"+target.hwnd+"-"+target.pid+"-"+target.startTimeTicks)){
          try{
            held=mutex.WaitOne(0);Require(held);Grant(json,operation,kind,text,expiry);ReadOnlyProvider.Observe(target);
            string visible=Visible(target);Require(Line(visible,"DOT_NATIVE_TEST_7F3A2C9B"));
            string last=visible.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).Where(x=>!String.IsNullOrWhiteSpace(x)).Last().TrimEnd(' ');
            Require(last==(kind=="paste"?"DOT_WRITE_READY>":"DOT_WRITE_READY> "+text));
            ReadOnlyProvider.AssertManualPrompt(target,kind=="paste"?"":text);
            using(var file=new FileStream(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-attempt-"+operation+".lock"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Flush(true);}
            Grant(json,operation,kind,text,expiry);
            foreach(int key in new[]{1,2,4,5,6,16,17,18,27,91,92,160,161,162,163,164,165})Require((GetAsyncKeyState(key)&0x8000)==0);
            ReadOnlyProvider.AssertManualPrompt(target,kind=="paste"?"":text);Grant(json,operation,kind,text,expiry);
            var events=Events(kind,text);phase="DISPATCH_OUTCOME_UNKNOWN";
            uint sent=SendInput((uint)events.Length,events,Marshal.SizeOf(typeof(Input)));Require(sent==events.Length);
            result=new{dispatched=true,target=target,operationId=operation,eventsInserted=sent,kind=kind};
          }finally{if(held)mutex.ReleaseMutex();}
        }
      }
      Console.Write(json.Serialize(result));return 0;
#else
      throw new InvalidOperationException();
#endif
    }catch{Console.Write("{\"dispatched\":"+(phase=="NOT_DISPATCHED"?"false":"null")+",\"diagnostic\":\"NATIVE_REQUEST_REFUSED_OR_UNCONFIRMED_NO_RETRY\",\"phase\":\""+phase+"\"}");return 0;}
  }
}

#endif
