#!/bin/bash

echo "正在移除extension工具中的所有中文注释..."

# diagnostics.ts - 批量替换
sed -i 's/扩展错误诊断工具/Extension error diagnosis tool/g' src/tools/extension/diagnostics.ts
sed -i 's/提供一键诊断扩展健康状况的功能/Provides one-click extension health diagnosis/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 1\. 获取扩展详情/\/\/ 1. Get extension details/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 2\. 收集错误日志/\/\/ 2. Collect error logs/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 过滤错误和警告/\/\/ Filter errors and warnings/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 检查其他潜在问题/\/\/ Check other potential issues/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 3\. 按类型分类错误/\/\/ 3. Classify errors by type/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 4\. 显示最频繁的错误/\/\/ 4. Show most frequent errors/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 5\. 错误详情/\/\/ 5. Error details/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 6\. 诊断建议/\/\/ 6. Diagnostic recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 7\. 健康评分/\/\/ 7. Health score/g' src/tools/extension/diagnostics.ts
sed -i 's/检查其他潜在问题（即使没有错误日志）/Check other potential issues (even without error logs)/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 检查 Service Worker 状态（MV3）/\/\/ Check Service Worker status (MV3)/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 检查上下文/\/\/ Check contexts/g' src/tools/extension/diagnostics.ts
sed -i 's/按类型分类错误/Classify errors by type/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 移除空分类/\/\/ Remove empty classifications/g' src/tools/extension/diagnostics.ts
sed -i 's/获取错误类型图标/Get error type icon/g' src/tools/extension/diagnostics.ts
sed -i 's/统计错误频率/Calculate error frequency/g' src/tools/extension/diagnostics.ts
sed -i 's/生成诊断建议/Generate diagnostic recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ Service Worker 建议/\/\/ Service Worker recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ JavaScript 错误建议/\/\/ JavaScript error recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ API 错误建议/\/\/ API error recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 权限错误建议/\/\/ Permission error recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 网络错误建议/\/\/ Network error recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 高频错误建议/\/\/ High frequency error recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 默认建议/\/\/ Default recommendations/g' src/tools/extension/diagnostics.ts
sed -i 's/计算健康评分/Calculate health score/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 基础分数 100/\/\/ Base score 100/g' src/tools/extension/diagnostics.ts
sed -i 's/\/\/ 每个错误扣分（根据时间范围调整）/\/\/ Deduct points per error (adjusted by time range)/g' src/tools/extension/diagnostics.ts
sed -i 's/获取健康评分表情/Get health score emoji/g' src/tools/extension/diagnostics.ts
sed -i 's/获取健康评分描述/Get health score description/g' src/tools/extension/diagnostics.ts

# manifest-inspector.ts - 批量替换
sed -i 's/Manifest 深度检查工具/Manifest deep inspection tool/g' src/tools/extension/manifest-inspector.ts
sed -i 's/提供 MV2\/MV3 兼容性分析、权限检查和最佳实践建议/Provides MV2\/MV3 compatibility analysis, permission checks and best practice recommendations/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 获取扩展详情（包含 manifest）/\/\/ Get extension details (includes manifest)/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 1\. 基本信息/\/\/ 1. Basic information/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 2\. Manifest 结构分析/\/\/ 2. Manifest structure analysis/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 3\. 权限分析/\/\/ 3. Permission analysis/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 4\. MV3 兼容性检查（仅 MV2）/\/\/ 4. MV3 compatibility check (MV2 only)/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 5\. 安全审计/\/\/ 5. Security audit/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 6\. 最佳实践检查/\/\/ 6. Best practices check/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 7\. 完整的 manifest JSON/\/\/ 7. Complete manifest JSON/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 8\. 总体评估/\/\/ 8. Overall assessment/g' src/tools/extension/manifest-inspector.ts
sed -i 's/分析 MV2 Manifest 结构/Analyze MV2 Manifest structure/g' src/tools/extension/manifest-inspector.ts
sed -i 's/分析 MV3 Manifest 结构/Analyze MV3 Manifest structure/g' src/tools/extension/manifest-inspector.ts
sed -i 's/分析权限/Analyze permissions/g' src/tools/extension/manifest-inspector.ts
sed -i 's/检查 MV3 迁移问题/Check MV3 migration issues/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 background\.scripts/\/\/ Check background.scripts/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 background\.persistent/\/\/ Check background.persistent/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 browser_action \/ page_action/\/\/ Check browser_action \/ page_action/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 blocking web request/\/\/ Check blocking web request/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 content_security_policy 格式/\/\/ Check content_security_policy format/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查远程代码/\/\/ Check remote code/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 显示结果/\/\/ Show results/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 迁移资源/\/\/ Migration resources/g' src/tools/extension/manifest-inspector.ts
sed -i 's/执行安全审计/Perform security audit/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查过度权限/\/\/ Check excessive permissions/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 host_permissions <all_urls>/\/\/ Check host_permissions <all_urls>/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 CSP/\/\/ Check CSP/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查外部资源/\/\/ Check external resources/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 显示结果/\/\/ Show results/g' src/tools/extension/manifest-inspector.ts
sed -i 's/检查最佳实践/Check best practices/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查图标/\/\/ Check icons/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查描述/\/\/ Check description/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 optional_permissions/\/\/ Check optional_permissions/g' src/tools/extension/manifest-inspector.ts
sed -i 's/\/\/ 检查 content_scripts 的 run_at/\/\/ Check content_scripts run_at/g' src/tools/extension/manifest-inspector.ts

# extension-messaging.ts - 批量替换
sed -i 's/扩展消息追踪工具/Extension message tracing tool/g' src/tools/extension-messaging.ts
sed -i 's/提供两个工具：/Provides two tools:/g' src/tools/extension-messaging.ts
sed -i 's/1\. monitor_extension_messages - 监控消息传递/1. monitor_extension_messages - Monitor message passing/g' src/tools/extension-messaging.ts
sed -i 's/2\. trace_extension_api_calls - 追踪 API 调用（简化版）/2. trace_extension_api_calls - Trace API calls (simplified version)/g' src/tools/extension-messaging.ts
sed -i 's/消息事件类型定义（匹配 Context 返回类型）/Message event type definition (matches Context return type)/g' src/tools/extension-messaging.ts
sed -i 's/监控扩展消息传递/Monitor extension message passing/g' src/tools/extension-messaging.ts
sed -i 's/\/\/ 统计信息/\/\/ Statistics/g' src/tools/extension-messaging.ts
sed -i 's/追踪扩展 API 调用（简化版）/Trace extension API calls (simplified version)/g' src/tools/extension-messaging.ts
sed -i 's/当前实现：通过消息监控推断 API 使用情况/Current implementation: Infer API usage through message monitoring/g' src/tools/extension-messaging.ts
sed -i 's/\/\/ 统计 API 调用/\/\/ Count API calls/g' src/tools/extension-messaging.ts
sed -i 's/\/\/ 分析高频调用/\/\/ Analyze high frequency calls/g' src/tools/extension-messaging.ts

# extension-storage-watch.ts - 批量替换
sed -i 's/扩展 Storage 监控工具/Extension Storage monitoring tool/g' src/tools/extension-storage-watch.ts
sed -i 's/实时监控扩展 Storage 的变化/Monitor extension Storage changes in real-time/g' src/tools/extension-storage-watch.ts
sed -i 's/Storage 变化事件类型定义（匹配 Context 返回类型）/Storage change event type definition (matches Context return type)/g' src/tools/extension-storage-watch.ts
sed -i 's/监控扩展 Storage 变化/Monitor extension Storage changes/g' src/tools/extension-storage-watch.ts
sed -i 's/\/\/ 详细显示每个键的变化/\/\/ Show detailed changes for each key/g' src/tools/extension-storage-watch.ts
sed -i 's/\/\/ 统计信息/\/\/ Statistics/g' src/tools/extension-storage-watch.ts
sed -i 's/\/\/ 分析频繁变化/\/\/ Analyze frequent changes/g' src/tools/extension-storage-watch.ts

echo "✅ 中文注释已全部移除"
echo "运行 npm run build 重新编译..."
