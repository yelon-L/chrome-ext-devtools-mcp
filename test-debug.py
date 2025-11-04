#!/usr/bin/env python3
"""调试 MCP 服务器"""

import json
import subprocess
import sys
import time
import select
import threading

def read_stderr(process):
    """读取 stderr"""
    while True:
        line = process.stderr.readline()
        if not line:
            break
        print(f"[STDERR] {line.rstrip()}", file=sys.stderr)

def test():
    print("启动服务器并监控输出...")
    process = subprocess.Popen(
        ['node', 'build/src/index.js', '--browserUrl', 'http://127.0.0.1:9222'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # 启动 stderr 读取线程
    stderr_thread = threading.Thread(target=read_stderr, args=(process,), daemon=True)
    stderr_thread.start()
    
    time.sleep(2)
    
    print("\n发送 initialize 请求...")
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"}
        }
    }
    
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    
    ready = select.select([process.stdout], [], [], 5)
    if ready[0]:
        response = process.stdout.readline()
        print(f"[RESPONSE] {response.rstrip()}")
    else:
        print("[ERROR] 响应超时")
    
    print("\n发送 tools/call 请求...")
    request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "get_connected_browser",
            "arguments": {}
        }
    }
    
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    
    print("等待响应（10秒）...")
    ready = select.select([process.stdout], [], [], 10)
    if ready[0]:
        response = process.stdout.readline()
        print(f"[RESPONSE] {response.rstrip()}")
    else:
        print("[ERROR] 响应超时")
    
    time.sleep(2)
    
    process.terminate()
    process.wait()

if __name__ == '__main__':
    test()
