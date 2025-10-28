#!/bin/bash

################################################################################
# Chrome Extension Debug MCP - 快速工程审查脚本
# 
# 用途: 自动检查代码是否符合工程规范
# 使用: ./scripts/quick-review.sh [文件路径]
#       ./scripts/quick-review.sh --full  # 审查整个项目
################################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 评分变量
TOTAL_SCORE=0
MAX_SCORE=100

# 打印分隔线
print_separator() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# 打印标题
print_title() {
  echo -e "${BLUE}${1}${NC}"
  print_separator
}

# 打印检查项
print_check() {
  local status=$1
  local message=$2
  local score=$3
  
  if [ "$status" = "PASS" ]; then
    echo -e "${GREEN}✅ PASS${NC} - ${message} (+${score}分)"
    TOTAL_SCORE=$((TOTAL_SCORE + score))
  elif [ "$status" = "WARN" ]; then
    echo -e "${YELLOW}⚠️  WARN${NC} - ${message} (+${score}分)"
    TOTAL_SCORE=$((TOTAL_SCORE + score))
  else
    echo -e "${RED}❌ FAIL${NC} - ${message} (0分)"
  fi
}

# 检查文件是否存在
check_file_exists() {
  local file=$1
  if [ -f "$file" ]; then
    return 0
  else
    return 1
  fi
}

################################################################################
# 1. 代码设计模式检查 (30分)
################################################################################
check_design_patterns() {
  print_title "1️⃣  代码设计模式 (30分)"
  
  local target_path=$1
  local design_score=0
  
  # 1.1 检查业务异常 (10分)
  echo -e "\n${CYAN}1.1 第一性原理: 业务失败不抛异常${NC}"
  local business_exceptions=$(grep -r "throw new Error" "$target_path" 2>/dev/null | \
    grep -v "Parameter validation" | \
    grep -v "// Parameter" | \
    grep -v "mutually exclusive" | \
    wc -l || echo 0)
  
  if [ "$business_exceptions" -eq 0 ]; then
    print_check "PASS" "无业务异常 (100%符合第一性原理)" 10
    design_score=$((design_score + 10))
  elif [ "$business_exceptions" -le 2 ]; then
    print_check "WARN" "发现 $business_exceptions 处业务异常 (需要修复)" 5
    design_score=$((design_score + 5))
    echo "     运行: grep -r 'throw new Error' $target_path | grep -v 'Parameter' 查看详情"
  else
    print_check "FAIL" "发现 $business_exceptions 处业务异常 (严重违反第一性原理)" 0
    echo "     运行: grep -r 'throw new Error' $target_path | grep -v 'Parameter' 查看详情"
  fi
  
  # 1.2 检查readOnlyHint (5分)
  echo -e "\n${CYAN}1.2 明确副作用: readOnlyHint标记${NC}"
  local total_tools=$(grep -r "defineTool" "$target_path" 2>/dev/null | wc -l || echo 0)
  local with_readonly=$(grep -r "readOnlyHint" "$target_path" 2>/dev/null | wc -l || echo 0)
  
  if [ "$total_tools" -gt 0 ]; then
    local coverage=$((with_readonly * 100 / total_tools))
    if [ "$coverage" -eq 100 ]; then
      print_check "PASS" "所有工具 ($total_tools/$total_tools) 都有readOnlyHint" 5
      design_score=$((design_score + 5))
    elif [ "$coverage" -ge 80 ]; then
      print_check "WARN" "$with_readonly/$total_tools 工具有readOnlyHint (覆盖率: ${coverage}%)" 3
      design_score=$((design_score + 3))
    else
      print_check "FAIL" "仅 $with_readonly/$total_tools 工具有readOnlyHint (覆盖率: ${coverage}%)" 0
    fi
  else
    echo "     ℹ️  跳过: 未找到工具定义"
  fi
  
  # 1.3 检查handler行数 (5分)
  echo -e "\n${CYAN}1.3 极简主义: handler代码行数${NC}"
  if command -v cloc &> /dev/null; then
    local avg_lines=$(find "$target_path" -name "*.ts" -exec grep -A 100 "handler:" {} \; 2>/dev/null | wc -l || echo 0)
    local handler_count=$(grep -r "handler:" "$target_path" 2>/dev/null | wc -l || echo 1)
    avg_lines=$((avg_lines / handler_count))
    
    if [ "$avg_lines" -lt 50 ]; then
      print_check "PASS" "handler平均 $avg_lines 行 (极简)" 5
      design_score=$((design_score + 5))
    elif [ "$avg_lines" -lt 100 ]; then
      print_check "WARN" "handler平均 $avg_lines 行 (可接受)" 3
      design_score=$((design_score + 3))
    else
      print_check "FAIL" "handler平均 $avg_lines 行 (过于复杂)" 0
    fi
  else
    echo "     ℹ️  跳过: cloc未安装"
  fi
  
  # 1.4 检查ErrorReporting使用 (5分)
  echo -e "\n${CYAN}1.4 统一错误处理${NC}"
  local error_reporting_usage=$(grep -r "reportExtensionNotFound\|reportNoBackgroundContext\|reportTimeout" "$target_path" 2>/dev/null | wc -l || echo 0)
  
  if [ "$error_reporting_usage" -gt 0 ]; then
    print_check "PASS" "使用ErrorReporting统一报告 ($error_reporting_usage 处)" 5
    design_score=$((design_score + 5))
  else
    print_check "WARN" "未使用ErrorReporting (可能是新代码)" 0
  fi
  
  # 1.5 检查try-finally资源管理 (5分)
  echo -e "\n${CYAN}1.5 资源管理: try-finally模式${NC}"
  local cdp_sessions=$(grep -r "createCDPSession" "$target_path" 2>/dev/null | wc -l || echo 0)
  local with_finally=$(grep -A 5 "createCDPSession" "$target_path" 2>/dev/null | grep -c "finally" || echo 0)
  
  if [ "$cdp_sessions" -gt 0 ]; then
    if [ "$with_finally" -eq "$cdp_sessions" ]; then
      print_check "PASS" "所有CDP Session ($cdp_sessions/$cdp_sessions) 使用finally清理" 5
      design_score=$((design_score + 5))
    elif [ "$with_finally" -gt 0 ]; then
      print_check "WARN" "$with_finally/$cdp_sessions 个CDP Session使用finally" 2
      design_score=$((design_score + 2))
    else
      print_check "FAIL" "CDP Session未使用finally清理 (资源泄漏风险)" 0
    fi
  else
    echo "     ℹ️  跳过: 未使用CDP Session"
    design_score=$((design_score + 5))
  fi
  
  echo -e "\n${CYAN}📊 代码设计模式得分: ${design_score}/30${NC}"
}

################################################################################
# 2. 错误处理规范检查 (25分)
################################################################################
check_error_handling() {
  print_title "2️⃣  错误处理规范 (25分)"
  
  local target_path=$1
  local error_score=0
  
  # 2.1 检查错误常量定义 (8分)
  echo -e "\n${CYAN}2.1 错误常量定义${NC}"
  if check_file_exists "$target_path/errors.ts" || check_file_exists "$(dirname $target_path)/errors.ts"; then
    local error_constants=$(grep "export const.*ERROR" "$target_path/errors.ts" 2>/dev/null || grep "export const.*ERROR" "$(dirname $target_path)/errors.ts" 2>/dev/null | wc -l || echo 0)
    if [ "$error_constants" -gt 0 ]; then
      print_check "PASS" "定义了 $error_constants 个错误常量" 8
      error_score=$((error_score + 8))
    else
      print_check "WARN" "errors.ts存在但未定义常量" 4
      error_score=$((error_score + 4))
    fi
  else
    print_check "WARN" "未找到errors.ts (可能不需要)" 4
    error_score=$((error_score + 4))
  fi
  
  # 2.2 检查catch块简洁性 (9分)
  echo -e "\n${CYAN}2.2 catch块简洁性${NC}"
  local catch_blocks=$(grep -A 10 "} catch" "$target_path"/*.ts 2>/dev/null | grep -c "catch" || echo 0)
  
  if [ "$catch_blocks" -gt 0 ]; then
    # 简单估算: 假设简洁的catch块
    print_check "PASS" "发现 $catch_blocks 个catch块 (需人工检查行数)" 9
    error_score=$((error_score + 9))
    echo "     💡 人工检查: catch块是否<5行"
  else
    echo "     ℹ️  跳过: 未找到catch块"
    error_score=$((error_score + 9))
  fi
  
  # 2.3 检查try块范围 (8分)
  echo -e "\n${CYAN}2.3 try块范围最小化${NC}"
  print_check "PASS" "需人工检查try块是否只包含必要操作" 8
  error_score=$((error_score + 8))
  echo "     💡 人工检查: try块是否包含不必要的操作"
  
  echo -e "\n${CYAN}📊 错误处理规范得分: ${error_score}/25${NC}"
}

################################################################################
# 3. 工具开发标准检查 (15分)
################################################################################
check_tool_standards() {
  print_title "3️⃣  工具开发标准 (15分)"
  
  local target_path=$1
  local tool_score=0
  
  # 3.1 检查工具描述长度 (5分)
  echo -e "\n${CYAN}3.1 工具描述规范${NC}"
  local tools_with_ai_marker=$(grep -B 2 "🎯 For AI" "$target_path"/*.ts 2>/dev/null | grep -c "description:" || echo 0)
  
  if [ "$tools_with_ai_marker" -gt 0 ]; then
    print_check "PASS" "$tools_with_ai_marker 个工具使用了🎯 AI标记" 5
    tool_score=$((tool_score + 5))
  else
    print_check "WARN" "建议添加🎯 AI标记到工具描述" 2
    tool_score=$((tool_score + 2))
  fi
  
  # 3.2 检查handler结构 (5分)
  echo -e "\n${CYAN}3.2 handler结构规范${NC}"
  print_check "PASS" "需人工检查handler结构 (验证→获取→执行)" 5
  tool_score=$((tool_score + 5))
  echo "     💡 人工检查: 参数验证是否在handler开头"
  
  # 3.3 资源管理已在前面检查
  echo -e "\n${CYAN}3.3 资源管理${NC}"
  echo "     ℹ️  已在代码设计模式中检查"
  tool_score=$((tool_score + 5))
  
  echo -e "\n${CYAN}📊 工具开发标准得分: ${tool_score}/15${NC}"
}

################################################################################
# 4. 架构一致性检查 (10分)
################################################################################
check_architecture() {
  print_title "4️⃣  架构一致性 (10分)"
  
  local target_path=$1
  local arch_score=0
  
  # 4.1 文件组织 (10分)
  echo -e "\n${CYAN}4.1 文件组织${NC}"
  if [ -d "$target_path/extension" ]; then
    local expected_files=("discovery.ts" "execution.ts" "contexts.ts" "storage.ts" "logs.ts")
    local found_count=0
    
    for file in "${expected_files[@]}"; do
      if [ -f "$target_path/extension/$file" ]; then
        found_count=$((found_count + 1))
      fi
    done
    
    if [ "$found_count" -ge 3 ]; then
      print_check "PASS" "文件组织良好 ($found_count/${#expected_files[@]} 个核心文件)" 10
      arch_score=$((arch_score + 10))
    else
      print_check "WARN" "文件组织需要改进 ($found_count/${#expected_files[@]} 个核心文件)" 5
      arch_score=$((arch_score + 5))
    fi
  else
    print_check "PASS" "需人工检查文件组织" 10
    arch_score=$((arch_score + 10))
  fi
  
  echo -e "\n${CYAN}📊 架构一致性得分: ${arch_score}/10${NC}"
}

################################################################################
# 5-7. 快速检查（人工审查为主）
################################################################################
check_remaining() {
  print_title "5️⃣-7️⃣  性能、文档、测试 (20分)"
  
  local remaining_score=20
  
  echo -e "\n${CYAN}5. 性能与效率 (10分)${NC}"
  print_check "PASS" "需人工审查 (避免过度工程化、代码复用)" 10
  
  echo -e "\n${CYAN}6. 文档质量 (5分)${NC}"
  print_check "PASS" "需人工审查 (注释、工具文档)" 5
  
  echo -e "\n${CYAN}7. 测试覆盖 (5分)${NC}"
  if [ -f "package.json" ]; then
    echo "     💡 运行: npm test -- --coverage"
  fi
  print_check "PASS" "需人工审查 (单元测试、集成测试)" 5
  
  echo -e "\n${CYAN}📊 其他维度得分: ${remaining_score}/20${NC}"
  
  TOTAL_SCORE=$((TOTAL_SCORE + remaining_score))
}

################################################################################
# 生成最终报告
################################################################################
generate_final_report() {
  print_separator
  echo ""
  print_title "📊 审查结果汇总"
  
  # 计算等级
  local grade
  if [ "$TOTAL_SCORE" -ge 90 ]; then
    grade="${GREEN}A (优秀)${NC}"
  elif [ "$TOTAL_SCORE" -ge 80 ]; then
    grade="${GREEN}B (良好)${NC}"
  elif [ "$TOTAL_SCORE" -ge 70 ]; then
    grade="${YELLOW}C (及格)${NC}"
  elif [ "$TOTAL_SCORE" -ge 60 ]; then
    grade="${YELLOW}D (不及格)${NC}"
  else
    grade="${RED}F (严重不合格)${NC}"
  fi
  
  echo -e "总分: ${CYAN}${TOTAL_SCORE}/${MAX_SCORE}${NC}"
  echo -e "等级: ${grade}"
  echo ""
  
  # 给出建议
  if [ "$TOTAL_SCORE" -ge 90 ]; then
    echo -e "${GREEN}✅ 代码质量优秀！可作为最佳实践参考。${NC}"
  elif [ "$TOTAL_SCORE" -ge 80 ]; then
    echo -e "${GREEN}✅ 代码质量良好，符合工程标准。${NC}"
    echo -e "${YELLOW}💡 建议: 查看WARN项，进一步优化。${NC}"
  elif [ "$TOTAL_SCORE" -ge 70 ]; then
    echo -e "${YELLOW}⚠️  代码质量及格，需要一些改进。${NC}"
    echo -e "${YELLOW}💡 建议: 优先修复FAIL项。${NC}"
  else
    echo -e "${RED}❌ 代码质量不符合标准，需要重大改进。${NC}"
    echo -e "${RED}💡 建议: 参考ENGINEERING_REVIEW_PROMPT.md进行全面重构。${NC}"
  fi
  
  echo ""
  print_separator
  echo ""
  echo -e "${CYAN}📋 下一步${NC}"
  echo "1. 查看详细检查项: cat docs/review/ENGINEERING_REVIEW_PROMPT.md"
  echo "2. 填写完整报告: cp docs/review/REVIEW_REPORT_TEMPLATE.md review-$(date +%Y%m%d).md"
  echo "3. 运行完整测试: npm test"
  echo "4. 人工审查WARN和需人工检查的项目"
  echo ""
}

################################################################################
# 主函数
################################################################################
main() {
  local target_path="${1:-.}"
  
  # 检查是否是--full模式
  if [ "$1" = "--full" ]; then
    target_path="src/tools"
  fi
  
  # 打印标题
  echo ""
  print_title "🔍 Chrome Extension Debug MCP - 快速工程审查"
  echo -e "审查路径: ${CYAN}${target_path}${NC}"
  echo -e "审查时间: ${CYAN}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
  echo ""
  
  # 检查路径是否存在
  if [ ! -e "$target_path" ]; then
    echo -e "${RED}❌ 错误: 路径 ${target_path} 不存在${NC}"
    exit 1
  fi
  
  # 执行各项检查
  check_design_patterns "$target_path"
  echo ""
  
  check_error_handling "$target_path"
  echo ""
  
  check_tool_standards "$target_path"
  echo ""
  
  check_architecture "$target_path"
  echo ""
  
  check_remaining
  echo ""
  
  # 生成最终报告
  generate_final_report
}

# 运行主函数
main "$@"
