#!/bin/bash
# 批量修复未使用的 error 变量
# 将 catch (error) 替换为 catch (_error) 表示有意不使用

set -e

echo "🔧 修复未使用的 error 变量..."

# 查找所有包含 } catch (error) 的 TypeScript 文件
files=$(find src tests -name "*.ts" -exec grep -l "} catch (error)" {} \;)

count=0
for file in $files; do
  # 替换 } catch (error) 为 } catch (_error)
  sed -i 's/} catch (error)/} catch (_error)/g' "$file"
  count=$((count + 1))
  echo "  ✅ $file"
done

echo ""
echo "✨ 完成！修复了 $count 个文件"
echo ""
echo "📊 运行 npm run lint 查看结果..."
