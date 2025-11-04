#!/usr/bin/env python3
"""测试 stdio MCP 服务器是否可用"""

import json
import subprocess
import sys
import time
import requests

def check_chrome():
    """检查 Chrome 是否在运行"""
    try:
        response = requests.get('http://127.0.0.1:9222/json/version', timeout=2)
        if response.status_code == 200:
            print("✅ Chrome 可访问")
            return True
    except:
        pass
    
    print("❌ Chrome 未在 9222 端口运行")
    print("请先启动 Chrome: google-chrome --remote-debugging-port=9222")
    return False

def test_stdio_mcp():
    """测试 stdio MCP 服务器"""
    print("=== 测试 stdio MCP 服务器 ===\n")
    
    if not check_chrome():
        return False
    
    print("\n启动 stdio MCP 服务器...")
    
    # 启动服务器
    process = subprocess.Popen(
        ['node', 'build/src/index.js', '--browserUrl', 'http://127.0.0.1:9222'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # 等待服务器启动
    time.sleep(2)
    
    # 检查进程是否还在运行
    if process.poll() is not None:
        print("❌ 服务器启动失败\n")
        stdout, stderr = process.communicate()
        print("STDOUT:", stdout)
        print("STDERR:", stderr)
        return False
    
    print(f"✅ 服务器已启动 (PID: {process.pid})\n")
    
    try:
        # 测试 1: 发送 initialize 请求
        print("测试 1: 发送 initialize 请求")
        
        initialize_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "test-client",
                    "version": "1.0.0"
                }
            }
        }
        
        # 发送请求
        request_line = json.dumps(initialize_request) + "\n"
        process.stdin.write(request_line)
        process.stdin.flush()
        
        # 读取响应（带超时）
        import select
        ready = select.select([process.stdout], [], [], 5)
        
        if ready[0]:
            response_line = process.stdout.readline()
            if response_line:
                try:
                    response = json.loads(response_line)
                    if 'result' in response and 'capabilities' in response['result']:
                        print("✅ 收到 initialize 响应")
                        print(f"   服务器能力: {list(response['result']['capabilities'].keys())}")
                    else:
                        print("⚠️  响应格式异常")
                        print(f"   响应: {response}")
                except json.JSONDecodeError:
                    print("⚠️  响应不是有效的 JSON")
                    print(f"   原始响应: {response_line}")
            else:
                print("⚠️  未收到响应")
        else:
            print("⚠️  响应超时")
        
        print()
        
        # 测试 2: 发送 tools/list 请求
        print("测试 2: 发送 tools/list 请求")
        
        tools_list_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        request_line = json.dumps(tools_list_request) + "\n"
        process.stdin.write(request_line)
        process.stdin.flush()
        
        ready = select.select([process.stdout], [], [], 5)
        
        if ready[0]:
            response_line = process.stdout.readline()
            if response_line:
                try:
                    response = json.loads(response_line)
                    if 'result' in response and 'tools' in response['result']:
                        tools = response['result']['tools']
                        print(f"✅ 收到 tools/list 响应")
                        print(f"   工具数量: {len(tools)}")
                        print(f"   前 5 个工具: {[t['name'] for t in tools[:5]]}")
                    else:
                        print("⚠️  响应格式异常")
                        print(f"   响应: {response}")
                except json.JSONDecodeError:
                    print("⚠️  响应不是有效的 JSON")
                    print(f"   原始响应: {response_line}")
            else:
                print("⚠️  未收到响应")
        else:
            print("⚠️  响应超时")
        
        print()
        
        # 检查进程状态
        if process.poll() is None:
            print("✅ 服务器仍在运行")
            result = True
        else:
            print("❌ 服务器已退出")
            result = False
        
    finally:
        # 清理
        print("\n关闭服务器...")
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        
        print("✅ 服务器已关闭")
    
    print("\n=== 测试完成 ===")
    return result

if __name__ == '__main__':
    success = test_stdio_mcp()
    sys.exit(0 if success else 1)
