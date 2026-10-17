// Shared fixed PTY fixture program; only tests spawn it. Stepping controls fixture phases, never PTY input.
export const syntheticGeometryProgram=String.raw`
import os,pty,tty,fcntl,termios,struct,select,json,base64,sys
master,slave=pty.openpty();tty.setraw(slave);offset=0;geometries=[]
def step():
    if '--stepped' in sys.argv:
        os.write(2,(json.dumps({'ready':offset})+'\n').encode())
        if os.read(0,1)!=b'n':raise RuntimeError('fixture control closed')
def emit(event):
    data=(json.dumps(event)+'\n').encode()
    while data:
        n=os.write(1,data);data=data[n:]
def resize(columns,rows):
    if select.select([master],[],[],0)[0]:raise RuntimeError('undrained boundary')
    fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0))
    actual=struct.unpack('HHHH',fcntl.ioctl(master,termios.TIOCGWINSZ,b'\0'*8))
    assert actual[:2]==(rows,columns);geometries.append([columns,rows,offset])
    emit({'type':'resize','columns':columns,'rows':rows,'atOffset':offset})
def output(payload):
    global offset
    sent=0
    while sent<len(payload):sent+=os.write(slave,payload[sent:])
    received=0
    while received<len(payload):
        if not select.select([master],[],[],2)[0]:raise RuntimeError('read timeout')
        data=os.read(master,min(3,len(payload)-received));received+=len(data);offset+=len(data)
        emit({'type':'data','base64':base64.b64encode(data).decode()})
try:
    step();resize(80,24);output(b'first\r\n')
    step();resize(40,12);output(b'\x1b[2;40HXY')
    step();resize(100,30);output(('\x1b[3;1H\x1b[31mRED\x1b[0m \U0001f9ea\x1b]52;c;YQ==\x07\x1b[6n').encode())
    step()
finally:
    os.close(slave);os.close(master)
    os.write(2,(json.dumps({'closed':True,'geometries':geometries})+'\n').encode())
emit({'type':'eof','atOffset':offset})
`;
