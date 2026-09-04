def filter(ch, state, cbuf, tbuf, strip_tags=[ _.strip() for _ in '''
+agatha:speak
+agatha:response
-agatha:think
-tool:call
'''.split() ]):
    if   state == 0:
        if ch == '<':
            state = 101
        else:
            cbuf += ch
    elif state == 100:
        if ch == '<':
            state = 101
        else:
            cbuf += ch
    elif state == 101:
        if ch == '/':
            state = 101
        else:
            tbuf += ch
            startswith = False
            for s in strip_tags:
                if s[1:].startswith(tbuf):
                    startswith = True
                    if len(s)-1 == len(tbuf):
                        if   s[0] == '-':
                            state = 114
                        elif s[0] == '+':
                            state = 104
                        else:
                            pass
                        tbuf = ''
                    else:
                        pass
                    break
                else:
                    pass
                pass
            if not startswith:
                state = 100
                cbuf += '<' + tbuf
                tbuf = ''
            else:
                pass  
    elif state == 104:
        if ch == '"':
            state = 105
        elif ch == '>':
            state = 100
        else:
            pass
    elif state == 105:
        if ch == '"':
            state = 104
        else:
            pass
        
    elif state == 114: 
        if ch == '"':
            state = 115
        elif ch == '/':
            state = 116
        elif ch == '>':
            state = 200
        else:
            pass
    elif state == 115:
        if ch == '"':
            state = 114
        else:
            pass
    elif state == 116: 
        if ch == '"':
            state = 115
        elif ch == '/':
            state = 116
        elif ch == '>':
            state = 100
        else:
            pass
        
    elif state == 200:
        if ch == '<':
            state = 201
        else:
            pass
    elif state == 201:
        if ch == '/':
            tbuf = ''
            state = 202
        else:
            state = 200
            pass
    elif state == 202:
        tbuf += ch
        startswith = False
        for s in strip_tags:
            if s[1:].startswith(tbuf):
                startswith = True
                if len(s)-1 == len(tbuf): 
                    if   s[0] == '-':
                        state = 203
                    else:
                        pass
                    tbuf = ''
                    break
                else:
                    pass
            else:
                pass
            pass
        if not startswith:
            state = 200
            tbuf = ''
        else:
            pass
    elif state == 203:
        if ch == ' ':
            state = 204
        elif ch == '<':
            state = 201
        elif ch == '>':
            state = 100
        else:
            state = 200
        pass
    elif state == 204: 
        if ch == '"':
            state = 205
        elif ch == '>':
            state = 100
        else:
            pass
    elif state == 205:
        if ch == '"':
            state = 206
        else:
            pass
    else:
        raise Exception('bad state', state)
    return state, cbuf, tbuf

if __name__=='__main__':
    import sys
    data = sys.stdin.read()
    state, cbuf, tbuf = 0, '', '',
    for ch in data:
        print(ch, end='', flush=True)
        state, cbuf, tbuf = filter(ch, state, cbuf, tbuf)
        pass
    print("====", state)
    if state == 100:
        print(cbuf)

