// Experimental console adapter. Executable entry point permits fake self-tests only.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace DotConnector.ConsolePrototype {
 [StructLayout(LayoutKind.Explicit, Size=20)] public struct Record {
  [FieldOffset(0)] public ushort Type;
  [FieldOffset(4)] public int Down;
  [FieldOffset(8)] public ushort Repeat;
  [FieldOffset(10)] public ushort VirtualKey;
  [FieldOffset(12)] public ushort Scan;
  [FieldOffset(14)] public ushort Unicode;
  [FieldOffset(16)] public uint Control;
 }
 public interface IConsoleApi {
  bool Attach(uint pid); IntPtr OpenInput(); bool Write(IntPtr handle, Record[] records, out uint written);
  bool Close(IntPtr handle); bool Detach(); int LastError {get;}
 }
 // Deliberately never constructed by the executable or product. No global keyboard APIs.
 internal sealed class WindowsApi : IConsoleApi {
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool WriteConsoleInputW(IntPtr h,[In] Record[] records,uint count,out uint written);
  int error; public int LastError {get{return error;}}
  public bool Attach(uint pid){bool ok=AttachConsole(pid);error=ok?0:Marshal.GetLastWin32Error();return ok;}
  public IntPtr OpenInput(){IntPtr h=CreateFileW("CONIN$",0x40000000,3,IntPtr.Zero,3,0,IntPtr.Zero);error=h==new IntPtr(-1)?Marshal.GetLastWin32Error():0;return h;}
  public bool Write(IntPtr h,Record[] r,out uint count){bool ok=WriteConsoleInputW(h,r,(uint)r.Length,out count);error=ok?0:Marshal.GetLastWin32Error();return ok;}
  public bool Close(IntPtr h){bool ok=CloseHandle(h);error=ok?0:Marshal.GetLastWin32Error();return ok;}
  public bool Detach(){bool ok=FreeConsole();error=ok?0:Marshal.GetLastWin32Error();return ok;}
 }
 public sealed class Outcome {public string Code="NOT_STARTED";public uint Written;public int NativeError;public bool CleanupConfirmed=true;public bool RetryAllowed=false;}
 public sealed class Adapter {
  readonly IConsoleApi api;int used;
  public Adapter(IConsoleApi value){api=value;}
  public static Record[] Literal(string text){
   if(String.IsNullOrEmpty(text)||text.Length>2048)throw new ArgumentException("TEXT_INVALID");
   var result=new List<Record>();
   for(int i=0;i<text.Length;i++){
    char c=text[i];if(Char.IsControl(c)||c=='\u2028'||c=='\u2029')throw new ArgumentException("TEXT_CONTROL_REFUSED");
    if(Char.IsHighSurrogate(c)){if(i+1>=text.Length||!Char.IsLowSurrogate(text[i+1]))throw new ArgumentException("TEXT_SURROGATE_INVALID");}
    else if(Char.IsLowSurrogate(c)&&(i==0||!Char.IsHighSurrogate(text[i-1])))throw new ArgumentException("TEXT_SURROGATE_INVALID");
    result.Add(new Record{Type=1,Down=1,Repeat=1,Unicode=c});result.Add(new Record{Type=1,Down=0,Repeat=1,Unicode=c});
   }
   return result.ToArray();
  }
  // trustedBinding must be an internal cooperative provider, never caller-provided JSON.
  // No such provider exists in the product. This injection point is used only by fake tests.
  public Outcome Paste(uint pid,string text,Func<bool> trustedBinding){
   var o=new Outcome();if(System.Threading.Interlocked.Exchange(ref used,1)!=0){o.Code="HELPER_ALREADY_USED";return o;}
   bool attached=false;IntPtr h=IntPtr.Zero;string phase="validate";
   try{
    if(pid==0||pid==UInt32.MaxValue){o.Code="CLIENT_PID_INVALID";return o;}
    Record[] records=Literal(text);
    if(trustedBinding==null||!trustedBinding()){o.Code="ASSOCIATION_UNPROVEN";return o;}
    phase="attach";if(!api.Attach(pid)){o.Code="ATTACH_FAILED";o.NativeError=api.LastError;return o;}attached=true;
    phase="open";h=api.OpenInput();if(h==IntPtr.Zero||h==new IntPtr(-1)){o.Code="OPEN_FAILED";o.NativeError=api.LastError;return o;}
    phase="identity";if(!trustedBinding()){o.Code="IDENTITY_CHANGED";return o;}
    phase="write";uint written;bool ok=api.Write(h,records,out written);o.Written=written;o.NativeError=api.LastError;
    o.Code=ok&&written==records.Length?"ENQUEUED_NOT_CONSUMED":"WRITE_OUTCOME_UNKNOWN_NO_RETRY";
   }catch(ArgumentException){o.Code=phase=="validate"?"TEXT_INVALID":"OPERATION_OUTCOME_UNKNOWN_NO_RETRY";if(phase=="attach"||phase=="open")o.CleanupConfirmed=false;}
   catch{o.Code="OPERATION_OUTCOME_UNKNOWN_NO_RETRY";if(phase=="attach"||phase=="open")o.CleanupConfirmed=false;}
   finally{
    if(h!=IntPtr.Zero&&h!=new IntPtr(-1)){try{if(!api.Close(h))o.CleanupConfirmed=false;}catch{o.CleanupConfirmed=false;}}
    if(attached){try{if(!api.Detach())o.CleanupConfirmed=false;}catch{o.CleanupConfirmed=false;}}
    if(!o.CleanupConfirmed)o.Code="CLEANUP_UNKNOWN_NO_RETRY";
   }
   return o;
  }
 }
 internal sealed class Fake : IConsoleApi {
  public bool AttachOk=true,OpenOk=true,WriteOk=true,CloseOk=true,DetachOk=true,ThrowWrite=false,ThrowOpen=false,ThrowClose=false,ThrowDetach=false,ThrowAttach=false,ThrowArgument=false;
  public uint? Count;public int Attaches,Opens,Writes,Closes,Detaches;public Record[] Seen;
  public int LastError {get{return 5;}}
  public bool Attach(uint p){Attaches++;if(ThrowAttach)throw new Exception();return AttachOk;}
  public IntPtr OpenInput(){Opens++;if(ThrowOpen)throw new Exception();return OpenOk?new IntPtr(7):new IntPtr(-1);}
  public bool Write(IntPtr h,Record[] r,out uint n){Writes++;Seen=r;n=Count??(uint)r.Length;if(ThrowArgument)throw new ArgumentException();if(ThrowWrite)throw new Exception();return WriteOk;}
  public bool Close(IntPtr h){Closes++;if(ThrowClose)throw new Exception();return CloseOk;}public bool Detach(){Detaches++;if(ThrowDetach)throw new Exception();return DetachOk;}
 }
 public static class Program {
  static int tests;static void Check(bool ok){tests++;if(!ok)throw new Exception("SELF_TEST_FAILED");}
  public static int Main(string[] args){
   if(args.Length!=1||args[0]!="--self-test"){Console.WriteLine("{\"available\":false,\"reason\":\"NO_COOPERATIVE_BINDING_PROVIDER\",\"nativeCalls\":false}");return 2;}
   try{
    Check(Marshal.SizeOf(typeof(Record))==20);Check(Marshal.OffsetOf(typeof(Record),"Unicode").ToInt32()==14);
    var f=new Fake();var a=new Adapter(f);var o=a.Paste(123,"literal $(x);😀",()=>true);Check(o.Code=="ENQUEUED_NOT_CONSUMED"&&!o.RetryAllowed);Check(f.Writes==1&&f.Closes==1&&f.Detaches==1);foreach(var r in f.Seen)Check(r.Unicode!=13&&r.VirtualKey==0&&r.Repeat==1);
    Check(a.Paste(123,"again",()=>true).Code=="HELPER_ALREADY_USED"&&f.Writes==1);
    foreach(string text in new[]{"","\r","\n","\t","\u001b","\0","\u2028","\ud800",new String('a',2049)}){f=new Fake();o=new Adapter(f).Paste(123,text,()=>true);Check(o.Code=="TEXT_INVALID"&&f.Attaches==0);}
    f=new Fake();Check(new Adapter(f).Paste(UInt32.MaxValue,"x",()=>true).Code=="CLIENT_PID_INVALID"&&f.Attaches==0);
    f=new Fake();Check(new Adapter(f).Paste(123,"x",()=>false).Code=="ASSOCIATION_UNPROVEN"&&f.Attaches==0);
    f=new Fake{AttachOk=false};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="ATTACH_FAILED"&&f.Detaches==0&&f.Opens==0);
    f=new Fake{OpenOk=false};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="OPEN_FAILED"&&f.Detaches==1&&f.Closes==0);
    f=new Fake();int checks=0;o=new Adapter(f).Paste(123,"x",()=>++checks==1);Check(o.Code=="IDENTITY_CHANGED"&&f.Writes==0&&f.Closes==1&&f.Detaches==1);
    foreach(uint n in new uint[]{0,1,3}){f=new Fake{Count=n};a=new Adapter(f);o=a.Paste(123,"x",()=>true);Check(o.Code=="WRITE_OUTCOME_UNKNOWN_NO_RETRY"&&o.Written==n&&f.Writes==1);Check(a.Paste(123,"x",()=>true).Code=="HELPER_ALREADY_USED"&&f.Writes==1);}
    f=new Fake{WriteOk=false};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="WRITE_OUTCOME_UNKNOWN_NO_RETRY"&&f.Detaches==1);
    f=new Fake{ThrowArgument=true};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="OPERATION_OUTCOME_UNKNOWN_NO_RETRY"&&f.Writes==1&&f.Detaches==1);
    f=new Fake{ThrowWrite=true};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="OPERATION_OUTCOME_UNKNOWN_NO_RETRY"&&f.Closes==1&&f.Detaches==1);
    foreach(bool close in new[]{true,false}){f=new Fake{CloseOk=close,DetachOk=false};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="CLEANUP_UNKNOWN_NO_RETRY"&&!o.CleanupConfirmed&&f.Detaches==1);}
    f=new Fake{CloseOk=false};o=new Adapter(f).Paste(123,"x",()=>true);Check(!o.CleanupConfirmed&&f.Detaches==1);
    f=new Fake{ThrowAttach=true};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="CLEANUP_UNKNOWN_NO_RETRY"&&!o.CleanupConfirmed&&f.Detaches==0);
    f=new Fake{ThrowOpen=true};o=new Adapter(f).Paste(123,"x",()=>true);Check(o.Code=="CLEANUP_UNKNOWN_NO_RETRY"&&!o.CleanupConfirmed&&f.Detaches==1&&f.Closes==0);
    f=new Fake{ThrowClose=true};o=new Adapter(f).Paste(123,"x",()=>true);Check(!o.CleanupConfirmed&&f.Detaches==1);
    f=new Fake{ThrowDetach=true};o=new Adapter(f).Paste(123,"x",()=>true);Check(!o.CleanupConfirmed&&f.Closes==1);
    for(int i=0;i<32;i++){f=new Fake();o=new Adapter(f).Paste(123,((char)i).ToString(),()=>true);Check(f.Attaches==0&&o.Code=="TEXT_INVALID");}
    Console.WriteLine("{\"passed\":true,\"assertions\":"+tests+",\"nativeCalls\":false,\"api\":\"fake\"}");return 0;
   }catch{Console.WriteLine("{\"passed\":false,\"nativeCalls\":false}");return 1;}
  }
 }
}
