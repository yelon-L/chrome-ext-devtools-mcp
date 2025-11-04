#!/usr/bin/env python3
"""测试核心工具功能"""

import json
import subprocess
import sys
import time
import select

# 核心工具列表
CORE_TOOLS = [
    {"name": "get_connected_browser", "args": {}},
    {"name": "list_pages", "args": {}},
    {"name": "list_extensions", "args": {}},
    {"name": "take_snapshot", "args": {}},
]

def send_request(process, method, params):
    """发送 MCP 请求"""
    request_id = int(time.time() * 1000)
    request = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params
    }
    
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    
    # 等待响应
    ready = select.select([process.stdout], [], [], 10)
    if ready[0]:
        response_line = process.stdout.readline()
        return json.loads(response_line)
    return None

def test_tools():
    """测试工具"""
    print("="*70)
    print("  stdio 模式核心工具测试")
    print("="*70)
    print()
    
    # 启动服务器
    print("启动 stdio 服务器...")
    process = subprocess.Popen(
        ['node', 'build/src/index.js', '--browserUrl', 'http://127.0.0.1:9222'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    time.sleep(2)
    
    if process.poll() is not None:
        print("❌ 服务器启动失败")
        return False
    
    print(f"✅ 服务器已启动 (PID: {process.pid})\n")
    
    try:
        # Initialize
        print("初始化连接...")
        response = send_request(process, "initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0.0"}
        })
        
        if not response or 'result' not in response:
            print("❌ 初始化失败")
            return False
        
        print("✅ 初始化成功\n")
        
        # 测试工具
        passed = 0
        failed = 0
        
        for tool in CORE_TOOLS:
            print(f"测试: {tool['name']}")
            response = send_request(process, "tools/call", {
                "name": tool['name'],
                "arguments": tool['args']
            })
            
            if response and 'result' in response:
                print(f"✅ {tool['name']} - 成功")
                # 显示部分结果
                result = response['result']
                if 'content' in result and result['content']:
                    content = result['content'][0]
                    if 'text' in content:
                        text = content['text'][:200]
                        print(f"   结果: {text}...")
                passed += 1
            else:
                error_msg = response.get('error', {}).get('message', 'Unknown') if response else 'Timeout'
                print(f"❌ {tool['name']} - 失败: {error_msg}")
                failed += 1
            print()
        
        # 总结
        print("="*70)
        print(f"测试完成: {passed}/{len(CORE_TOOLS)} 通过")
        print("="*70)
        
        return failed == 0
        
    finally:
        print("\n关闭服务器...")
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        print("✅ 已清理")

if __name__ == '__main__':
    success = test_tools()
    sys.exit(0 if success else 1)
