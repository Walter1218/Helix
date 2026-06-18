#!/bin/bash

# Helix AI 能力全链路测试启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

# 检查依赖
check_dependencies() {
  print_info "检查依赖..."
  
  # 检查 Node.js
  if ! command -v node &> /dev/null; then
    print_error "Node.js 未安装，请先安装 Node.js"
    exit 1
  fi
  
  # 检查 npm
  if ! command -v npm &> /dev/null; then
    print_error "npm 未安装，请先安装 npm"
    exit 1
  fi
  
  print_success "依赖检查通过"
}

# 安装依赖
install_dependencies() {
  print_info "安装依赖..."
  
  # 检查是否需要安装依赖
  if [ ! -d "node_modules" ]; then
    npm install
    print_success "依赖安装完成"
  else
    print_info "依赖已存在，跳过安装"
  fi
}

# 启动 Mock 服务器
start_mock_server() {
  print_info "启动 Mock API 服务器..."
  
  # 检查端口是否被占用
  if lsof -Pi :3095 -sTCP:LISTEN -t >/dev/null ; then
    print_warning "端口 3095 已被占用，尝试关闭现有进程..."
    kill $(lsof -t -i:3095) 2>/dev/null || true
    sleep 1
  fi
  
  # 启动服务器
  node test-server.js &
  SERVER_PID=$!
  
  # 等待服务器启动
  sleep 2
  
  # 检查服务器是否启动成功
  if curl -s http://localhost:3095/session > /dev/null; then
    print_success "Mock API 服务器已启动 (PID: $SERVER_PID)"
    print_info "服务器地址: http://localhost:3095"
  else
    print_error "Mock API 服务器启动失败"
    exit 1
  fi
}

# 打开测试界面
open_test_interface() {
  print_info "打开测试界面..."
  
  # 获取当前目录的绝对路径
  CURRENT_DIR=$(pwd)
  TEST_FILE="$CURRENT_DIR/test-browser.html"
  
  # 检查测试文件是否存在
  if [ ! -f "$TEST_FILE" ]; then
    print_error "测试文件不存在: $TEST_FILE"
    exit 1
  fi
  
  # 根据操作系统打开浏览器
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "$TEST_FILE"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open "$TEST_FILE"
  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows
    start "$TEST_FILE"
  else
    print_warning "无法自动打开浏览器，请手动打开: $TEST_FILE"
  fi
  
  print_success "测试界面已打开"
}

# 运行 Node.js 测试
run_node_tests() {
  print_info "运行 Node.js 测试..."
  
  # 运行测试脚本
  node test-ai-capabilities.js
  
  print_success "Node.js 测试完成"
}

# 清理函数
cleanup() {
  print_info "清理资源..."
  
  # 关闭服务器
  if [ ! -z "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
    print_info "Mock API 服务器已关闭"
  fi
}

# 主函数
main() {
  echo "=========================================="
  echo "🧬 Helix AI 能力全链路测试"
  echo "=========================================="
  echo ""
  
  # 设置清理陷阱
  trap cleanup EXIT
  
  # 检查依赖
  check_dependencies
  
  # 安装依赖
  install_dependencies
  
  # 启动 Mock 服务器
  start_mock_server
  
  # 询问用户选择测试方式
  echo ""
  print_info "请选择测试方式:"
  echo "1) 浏览器测试界面 (推荐)"
  echo "2) Node.js 命令行测试"
  echo "3) 两者都运行"
  echo ""
  
  read -p "请输入选项 (1-3): " choice
  
  case $choice in
    1)
      open_test_interface
      ;;
    2)
      run_node_tests
      ;;
    3)
      open_test_interface
      run_node_tests
      ;;
    *)
      print_warning "无效选项，使用默认选项 1"
      open_test_interface
      ;;
  esac
  
  echo ""
  print_success "测试准备完成！"
  print_info "测试界面将在浏览器中打开"
  print_info "Mock API 服务器正在运行: http://localhost:3095"
  print_info "按 Ctrl+C 停止服务器"
  
  # 等待用户中断
  wait
}

# 运行主函数
main "$@"
