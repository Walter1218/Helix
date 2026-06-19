诊断情况：用户反馈"Connected 但回复离线" + "终端闪退"

分析后发现的矛盾点：
1. 后端 API 测试完全正常（health、session list、创建 session 均返回正确 JSON）
2. 扩展已安装到 1.14.20，所有修复已到位
3. 但前端仍显示 Connected 却回复 mock

关键怀疑：
- 如果 webview 的 HTML 是旧的（因为 `retainContextWhenHidden` 缓存），`__HELIX_SERVER_PORT__` 可能是旧端口
- 但旧端口的服务（32405）仍然存活，API 正常
- 如果 `initSession` 被调用且成功，`currentSessionId` 应该被设置
- 如果 `currentSessionId` 被设置，`sendMessage` 应该调用 `sendRealMessage`
- 但用户看到 mock，说明 `currentSessionId` 为 null

如果 `currentSessionId` 为 null，但后端 API 正常，这只有一种解释：
`initSession` 的 `catch` 块被触发，但 `addSystemMessage` 没有显示错误消息。

或者更可能：用户实际上没有 reload window，或者 reload 后 VS Code 没有正确加载新扩展。

或者：后端启动时遇到错误（如数据库初始化失败），导致某些路由没有注册，但 health 检查通过。

需要收集的信息：
1. VS Code Output 面板中 `Helix Server` 的日志
2. 用户按 `Cmd+Esc` 时的实际端口
3. 前端 Console 日志

但由于用户不想手动操作，我可能需要写一个自动诊断脚本。