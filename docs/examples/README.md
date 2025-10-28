# V2 API 测试脚本

## 📋 可用脚本

### 1. test-v2-api-curl.sh

完整的 V2 API curl 测试脚本，包含详细的使用说明。

**功能**:

- 测试所有 V2 API 端点（13 个）
- 彩色输出和详细日志
- 自动化测试流程
- 包含使用说明和示例

**使用方法**:

```bash
cd docs/examples
chmod +x test-v2-api-curl.sh
./test-v2-api-curl.sh
```

**前置条件**:

1. 服务器已启动: `npm run start:multi-tenant`
2. 浏览器调试端口已开启: `chrome --remote-debugging-port=9222`
3. 已安装 jq (可选): `sudo apt install jq`

### 2. test-email-registration-v2.sh

邮箱注册流程示例。

### 3. test-browser-binding.sh

浏览器绑定流程示例。

## 📖 更多文档

- API 文档: `docs/guides/MULTI_TENANT_USAGE.md`
- 迁移指南: `docs/guides/V2_API_MIGRATION_GUIDE.md`
- 测试报告: `V2_API_TEST_REPORT.md`
