#!/usr/bin/env python3
from aif.lib.wsutil import *


def repeat(thunk, exit_on_true=True, delay=0):
    while 1:
        ret = thunk() 
        if exit_on_true and ret:
            return ret
        if delay:
            time.sleep(delay)
            pass
        pass
    return


def main():
    in_channel = 'vid-in'
    out_channel = 'vid-out'

    ws = ws_connect(in_channel)

    #create_video_directory()

    files = []
    
    def once():
        newfiles = os.listdir(VIDEO_DIR)
        fs = set([x for x in files if x.endswith('.DUN')])
        nfs = set([x for x in newfiles if x.endswith('.DUN')])
        diff = nfs - fs
        #print("DIFF", len(diff), type(diff), diff)
        if len(diff) == 1:
            fn = list(diff)[0]
            print("FN ", fn)
            print("FN ", fn[:-4])
            time.sleep(0.1)
            prompt = (
                   'what is this? '
                   'does the person look like they want to talk? '
                   'how many people are in the shot?'
                   )
            cmd = ('ollama run llava "respond in JSON format. '
                   + prompt + "\" " + VIDEO_DIR+'/'+fn[:-4])
            print("CMD", cmd)
            assert 0==os.system(cmd)
            print("DONE")
            pass
        if len(newfiles) >= 6:
            os.system(f'rm -fr {VIDEO_DIR}/*')
            print("Just got rid of ALL the video files")
            newfiles = []
        else:
            #print("...")
            pass
        files[:] = newfiles
        pass

    gevent.spawn(lambda:repeat(once,0,0.1))
    
    while 1:
        print("Waiting on socket...")
        msg = recv(ws)
        print("Got", (msg,), "!")

        method = msg.get('method')
        params = msg.get('params',{})
        
        if method=='initialize':
            print("INIT", params)

        elif method=='pub':
            #print("PUB", params)
            content = params['content']
            generate_audio(content, out_channel, ws, done=True)
            #print("PUB2", ws, out_channel, True)
            
        else:
            print("*"*80)
            print("ERROR, BAD PACKET", msg)
            print("*"*80)
            pass

        time.sleep(0.2)
        pass

    return print("EOF")


if __name__=='__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
