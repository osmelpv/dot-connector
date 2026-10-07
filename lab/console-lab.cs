// Laboratory only. Main never constructs the native backend; self-tests use fake APIs.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
namespace DotConnector.ConsoleLab {
 public sealed class Identity {
  public uint Pid;public long StartTicks;public string User;public int Session;
  public bool Same(Identity other){return other!=null&&Pid>0&&Pid!=UInt32.MaxValue&&StartTicks>0&&!String.IsNullOrEmpty(User)&&Session>=0&&Pid==other.Pid&&StartTicks==other.StartTicks&&User==other.User&&Session==other.Session;}
 }
 public interface IChild { bool WaitSlice();void Close(); }
 public interface ILaunchApi { IntPtr OpenConsole(string name);IChild StartWsl(IntPtr input,IntPtr output,IntPtr error);void Close(IntPtr h); }
 public sealed class Launcher {
  readonly ILaunchApi api;int used,enabled;public bool CleanupConfirmed=true;
  void Cleanup(Action action){try{action();}catch{CleanupConfirmed=false;}}public bool OperationsEnabled {get{return Volatile.Read(ref enabled)==1;}}
  public Launcher(ILaunchApi value){api=value;}
  public void ControllerDisconnected(){Interlocked.Exchange(ref enabled,0);}
  public void Run(){
   if(Interlocked.Exchange(ref used,1)!=0)throw new InvalidOperationException("ONE_SHOT");
   IntPtr input=IntPtr.Zero,output=IntPtr.Zero;IChild child=null;bool exited=false;
   try{
    input=api.OpenConsole("CONIN$");output=api.OpenConsole("CONOUT$");
    if(input==IntPtr.Zero||input==new IntPtr(-1)||output==IntPtr.Zero||output==new IntPtr(-1))throw new InvalidOperationException("CONSOLE_HANDLE_INVALID");
    child=api.StartWsl(input,output,output);if(child==null)throw new InvalidOperationException("CREATE_FAILED");
    // Product never enables operations. A future controller may only revoke this gate.
    while(!exited){try{exited=child.WaitSlice();}catch{ControllerDisconnected();Thread.Sleep(10);}}
   }finally{
    ControllerDisconnected();
    // Never release the launcher back to its parent while a created child is known live.
    if(child!=null&&exited)Cleanup(()=>child.Close());
    if(output!=IntPtr.Zero&&output!=new IntPtr(-1))Cleanup(()=>api.Close(output));
    if(input!=IntPtr.Zero&&input!=new IntPtr(-1))Cleanup(()=>api.Close(input));
   }
  }
 }
 [StructLayout(LayoutKind.Sequential)] public struct Coord {public short X,Y;public Coord(short x,short y){X=x;Y=y;}}
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public short Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Explicit,Size=4)] public struct Cell {[FieldOffset(0)]public ushort Character;[FieldOffset(2)]public ushort Attributes;}
 public interface IProbeApi {
  Identity Observe(uint pid);bool Attach(uint pid);uint Processes(uint[] ids);IntPtr OpenOutput();
  Rect Viewport(IntPtr h);bool Read(IntPtr h,Cell[] cells,Coord size,ref Rect area);bool Close(IntPtr h);bool Detach();
 }
 public sealed class ProbeResult {public string Code="UNAVAILABLE";public string Evidence="none";public string Text;public bool CleanupConfirmed=true;public bool InputProven=false;}
 public sealed class ConsoleProbe {
  readonly IProbeApi api;int used;public ConsoleProbe(IProbeApi value){api=value;}
  public ProbeResult Read(Identity expected){
   var result=new ProbeResult();if(Interlocked.Exchange(ref used,1)!=0){result.Code="ONE_SHOT";return result;}
   if(expected==null||!expected.Same(expected)){result.Code="IDENTITY_MISMATCH";return result;}
   expected=new Identity{Pid=expected.Pid,StartTicks=expected.StartTicks,User=expected.User,Session=expected.Session};
   bool attached=false;IntPtr h=IntPtr.Zero;string phase="identity";
   try{
    if(expected==null||!expected.Same(api.Observe(expected.Pid))){result.Code="IDENTITY_MISMATCH";return result;}
    phase="attach";if(!api.Attach(expected.Pid)){result.Code="ATTACH_FAILED";return result;}attached=true;
    phase="membership";uint[] ids=new uint[64];uint n=api.Processes(ids);if(n==0||n>64||Array.IndexOf(ids,expected.Pid,0,(int)n)<0){result.Code="CONSOLE_MEMBERSHIP_UNPROVEN";return result;}
    if(!expected.Same(api.Observe(expected.Pid))){result.Code="IDENTITY_CHANGED";return result;}
    phase="open";h=api.OpenOutput();if(h==IntPtr.Zero||h==new IntPtr(-1)){result.Code="OUTPUT_UNAVAILABLE";return result;}
    phase="read";Rect area=api.Viewport(h);int width=area.Right-area.Left+1,height=area.Bottom-area.Top+1;
    if(area.Left<0||area.Top<0||width<1||height<1||width>200||height>80||width*height>16000){result.Code="VIEWPORT_LIMIT";return result;}
    Rect requested=area;var cells=new Cell[width*height];if(!api.Read(h,cells,new Coord((short)width,(short)height),ref area)||!area.Equals(requested)||!api.Viewport(h).Equals(requested)){result.Code="READ_OR_RESIZE_UNCERTAIN";return result;}
    if(!expected.Same(api.Observe(expected.Pid))){result.Code="IDENTITY_CHANGED";return result;}
    var text=new StringBuilder();for(int y=0;y<height;y++){for(int x=0;x<width;x++)text.Append((char)cells[y*width+x].Character);if(y+1<height)text.Append('\n');}
    result.Text=text.ToString();result.Code="SNAPSHOT";result.Evidence="console-output-only";
   }catch{result.Code="PROBE_FAILED";if(phase=="attach"||phase=="open")result.CleanupConfirmed=false;}
   finally{
    if(h!=IntPtr.Zero&&h!=new IntPtr(-1)){try{if(!api.Close(h))result.CleanupConfirmed=false;}catch{result.CleanupConfirmed=false;}}
    if(attached){try{if(!api.Detach())result.CleanupConfirmed=false;}catch{result.CleanupConfirmed=false;}}
    if(!result.CleanupConfirmed){result.Code="CLEANUP_UNKNOWN";result.Text=null;result.Evidence="none";}
   }
   return result;
  }
 }
 // Native declarations are compiled, never activated. Observe must come from a reviewed provider.
 internal static class Native {
  [StructLayout(LayoutKind.Sequential)] internal struct Security {public int Size;public IntPtr Descriptor;public int Inherit;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct Startup {public int Size;public string Reserved,Desktop,Title;public int X,Y,Width,Height,Columns,Rows,Fill;public uint Flags;public short Show,Reserved2;public IntPtr ReservedBytes,Input,Output,Error;}
  [StructLayout(LayoutKind.Sequential)] internal struct Extended {public Startup Info;public IntPtr Attributes;}
  [StructLayout(LayoutKind.Sequential)] internal struct ProcessInfo {public IntPtr Process,Thread;public uint Pid,Tid;}
  [StructLayout(LayoutKind.Sequential)] internal struct BufferInfo {public Coord Size,Cursor;public ushort Attributes;public Rect Window;public Coord Maximum;}
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] internal static extern IntPtr CreateFileW(string name,uint access,uint share,ref Security security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr bytes);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] internal static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] internal static extern bool CreateProcessW(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string cwd,ref Extended startup,out ProcessInfo info);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern uint WaitForSingleObject(IntPtr h,uint timeout);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool FreeConsole();
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern uint GetConsoleProcessList([Out] uint[] ids,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool GetConsoleScreenBufferInfo(IntPtr h,out BufferInfo info);
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] internal static extern bool ReadConsoleOutputW(IntPtr h,[Out] Cell[] cells,Coord size,Coord origin,ref Rect region);
 }
 internal sealed class WindowsChild:IChild {
  readonly IntPtr handle,thread;public WindowsChild(IntPtr value,IntPtr threadHandle){handle=value;thread=threadHandle;}
  public bool WaitSlice(){uint n=Native.WaitForSingleObject(handle,250);if(n==0)return true;if(n==258)return false;throw new InvalidOperationException("WAIT_UNCERTAIN");}
  public void Close(){bool first=Native.CloseHandle(thread),second=Native.CloseHandle(handle);if(!first||!second)throw new InvalidOperationException("CLEANUP_UNKNOWN");}
 }
 internal sealed class WindowsLaunch:ILaunchApi {
  public IntPtr OpenConsole(string name){var s=new Native.Security{Size=Marshal.SizeOf(typeof(Native.Security)),Inherit=1};var h=Native.CreateFileW(name,name=="CONIN$"?0x80000000u:0x40000000u,3,ref s,3,0,IntPtr.Zero);if(h==new IntPtr(-1))throw new InvalidOperationException("OPEN_FAILED");return h;}
  public void Close(IntPtr h){if(!Native.CloseHandle(h))throw new InvalidOperationException("CLOSE_FAILED");}
  public IChild StartWsl(IntPtr input,IntPtr output,IntPtr error){
   IntPtr bytes=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero;bool initialized=false;
   try{
    Native.InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref bytes);if(bytes.ToInt64()<1||bytes.ToInt64()>65536)throw new InvalidOperationException("ATTRIBUTE_SIZE");list=Marshal.AllocHGlobal(bytes);
    if(!Native.InitializeProcThreadAttributeList(list,1,0,ref bytes))throw new InvalidOperationException("ATTRIBUTE_INIT");initialized=true;
    // Only these two inheritable handles enter the new process. stderr shares CONOUT$.
    if(error!=output)throw new InvalidOperationException("HANDLE_CONTRACT");handles=Marshal.AllocHGlobal(2*IntPtr.Size);Marshal.WriteIntPtr(handles,0,input);Marshal.WriteIntPtr(handles,IntPtr.Size,output);
    if(!Native.UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(2*IntPtr.Size),IntPtr.Zero,IntPtr.Zero))throw new InvalidOperationException("HANDLE_LIST");
    string app=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"wsl.exe");var start=new Native.Extended{Info=new Native.Startup{Size=Marshal.SizeOf(typeof(Native.Extended)),Flags=0x100,Input=input,Output=output,Error=error},Attributes=list};Native.ProcessInfo process;
    if(!Native.CreateProcessW(app,new StringBuilder("\""+app+"\""),IntPtr.Zero,IntPtr.Zero,true,0x80000,IntPtr.Zero,null,ref start,out process))throw new InvalidOperationException("CREATE_FAILED");
    // Keep the process handle even if thread-handle cleanup fails: do not abandon a live child.
    return new WindowsChild(process.Process,process.Thread);
   }finally{if(initialized)Native.DeleteProcThreadAttributeList(list);if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);}
  }
 }
 internal sealed class WindowsProbe:IProbeApi {
  readonly Func<uint,Identity> observe;public WindowsProbe(Func<uint,Identity> trustedObserve){observe=trustedObserve;}
  public Identity Observe(uint pid){return observe(pid);}public bool Attach(uint pid){return Native.AttachConsole(pid);}public uint Processes(uint[] ids){return Native.GetConsoleProcessList(ids,(uint)ids.Length);}
  public IntPtr OpenOutput(){var s=new Native.Security{Size=Marshal.SizeOf(typeof(Native.Security))};return Native.CreateFileW("CONOUT$",0x80000000,3,ref s,3,0,IntPtr.Zero);}
  public Rect Viewport(IntPtr h){Native.BufferInfo b;if(!Native.GetConsoleScreenBufferInfo(h,out b))throw new InvalidOperationException();return b.Window;}
  public bool Read(IntPtr h,Cell[] c,Coord size,ref Rect area){return Native.ReadConsoleOutputW(h,c,size,new Coord(0,0),ref area);}public bool Close(IntPtr h){return Native.CloseHandle(h);}public bool Detach(){return Native.FreeConsole();}
 }
 internal sealed class FakeLaunch:ILaunchApi,IChild {
  public Launcher Owner;public int Waits,Closed;public bool Started,ChildClosed,ThrowWait=true,ThrowClose=false,FailStart=false,FailOutput=false;
  public IntPtr OpenConsole(string n){if(FailOutput&&n=="CONOUT$")throw new Exception("OPEN_FAILED");return new IntPtr(n=="CONIN$"?10:11);}public void Close(IntPtr h){if(Started&&!ChildClosed)throw new Exception("EARLY_CLOSE");Closed++;if(ThrowClose)throw new Exception();}
  public IChild StartWsl(IntPtr i,IntPtr o,IntPtr e){if(FailStart)throw new Exception("START_FAILED");if(i.ToInt32()!=10||o.ToInt32()!=11||e!=o)throw new Exception();Started=true;return this;}
  public bool WaitSlice(){Waits++;Owner.ControllerDisconnected();if(Owner.OperationsEnabled)throw new Exception();if(ThrowWait&&Waits==1)throw new Exception("SIMULATED_WAIT_ERROR");return Waits>=3;}
  public void Close(){ChildClosed=true;if(ThrowClose)throw new Exception();}
 }
 internal sealed class FakeProbe:IProbeApi {
  public Identity Id=new Identity{Pid=10,StartTicks=123,User="owner",Session=1};public int Observations,Reads,Closed,Detached,Attached;public bool ChangeIdentity,Many,Resize,FailRead,FailClose,FailAttach;public int Width=2;
  public Identity Observe(uint p){Observations++;return new Identity{Pid=Id.Pid,StartTicks=ChangeIdentity&&Observations>1?124:123,User=Id.User,Session=Id.Session};}
  public bool Attach(uint p){Attached++;return !FailAttach;}public uint Processes(uint[] a){a[0]=10;return Many?65u:1u;}public IntPtr OpenOutput(){return new IntPtr(5);}
  public Rect Viewport(IntPtr h){return new Rect{Right=(short)(Width-1),Bottom=0};}
  public bool Read(IntPtr h,Cell[] c,Coord s,ref Rect r){Reads++;foreach(int i in new[]{0,1})if(i<c.Length)c[i].Character=(ushort)'x';if(Resize)r.Right++;return !FailRead;}public bool Close(IntPtr h){Closed++;return !FailClose;}public bool Detach(){Detached++;return true;}
 }
 public static class Program {
  static int count;static void Check(bool ok){count++;if(!ok)throw new Exception();}
  public static int Main(string[] args){if(args.Length!=1||args[0]!="--self-test"){Console.WriteLine("{\"available\":false,\"nativeCalls\":false}");return 2;}
   try{
    var launch=new FakeLaunch();var owner=new Launcher(launch);launch.Owner=owner;owner.Run();Check(launch.Waits==3&&launch.ChildClosed&&launch.Closed==2&&!owner.OperationsEnabled);bool refused=false;try{owner.Run();}catch{refused=true;}Check(refused);
    launch=new FakeLaunch{ThrowClose=true};owner=new Launcher(launch);launch.Owner=owner;owner.Run();Check(!owner.CleanupConfirmed&&launch.ChildClosed&&launch.Closed==2);
    foreach(bool failStart in new[]{false,true}){launch=new FakeLaunch{FailStart=failStart,FailOutput=!failStart};owner=new Launcher(launch);launch.Owner=owner;bool failed=false;try{owner.Run();}catch{failed=true;}Check(failed&&!launch.Started&&launch.Closed==(failStart?2:1));}
    Check(Marshal.SizeOf(typeof(Cell))==4);Check(Marshal.SizeOf(typeof(Coord))==4);Check(Marshal.SizeOf(typeof(Rect))==8);
    var f=new FakeProbe();var result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="SNAPSHOT"&&result.Text=="xx"&&!result.InputProven&&result.Evidence=="console-output-only");Check(f.Closed==1&&f.Detached==1);
    f=new FakeProbe{ChangeIdentity=true};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="IDENTITY_CHANGED"&&f.Reads==0&&f.Detached==1);
    f=new FakeProbe{Many=true};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="CONSOLE_MEMBERSHIP_UNPROVEN"&&f.Reads==0);
    f=new FakeProbe{Resize=true};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="READ_OR_RESIZE_UNCERTAIN"&&result.Text==null);
    f=new FakeProbe{FailRead=true};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="READ_OR_RESIZE_UNCERTAIN"&&f.Closed==1);
    f=new FakeProbe{FailClose=true};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="CLEANUP_UNKNOWN"&&result.Text==null&&f.Detached==1);
    f=new FakeProbe{FailAttach=true};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="ATTACH_FAILED"&&f.Detached==0);
    foreach(int width in new[]{0,201,32767}){f=new FakeProbe{Width=width};result=new ConsoleProbe(f).Read(f.Id);Check(result.Code=="VIEWPORT_LIMIT"&&f.Reads==0);}
    f=new FakeProbe();var wrong=new Identity{Pid=10,StartTicks=123,User="other",Session=1};result=new ConsoleProbe(f).Read(wrong);Check(result.Code=="IDENTITY_MISMATCH"&&f.Attached==0);
    wrong=new Identity{Pid=10,StartTicks=123,User="owner",Session=2};result=new ConsoleProbe(f).Read(wrong);Check(result.Code=="IDENTITY_MISMATCH"&&f.Attached==0);
    Console.WriteLine("{\"passed\":true,\"assertions\":"+count+",\"nativeCalls\":false,\"wslLaunched\":false,\"api\":\"fake\"}");return 0;
   }catch{Console.WriteLine("{\"passed\":false,\"nativeCalls\":false}");return 1;}
  }
 }
}
