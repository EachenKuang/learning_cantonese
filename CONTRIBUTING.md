# 参与粵學堂

感谢你帮助改进粵學堂。项目优先接受可验证的小改动：发音或释义修正、无障碍和移动端体验、测试覆盖、同步可靠性及离线体验。

## 开发与验证

1. 使用 Node.js 22，与 GitHub Actions 保持一致。
2. 修改前先建立独立分支。
3. 完成后依次运行：
   - node --check js/data.js
   - node --check js/songs.js
   - node --check js/lessons.js
   - node --check js/stories.js
   - node --check js/app.js
   - node --check sw.js
   - node scripts/verify-data.mjs
   - node --test server/sync-store.test.mjs
4. 静态资源发生变化时，运行 node scripts/bump-version.mjs，再重新执行数据校验。
5. 提交前检查 git status --short，确认没有用户数据、备份、环境文件、证书或密钥。

## 内容与版权

- 不要提交第三方完整歌词、音频、封面、字幕、课程或其他未授权内容。
- 歌曲导览只提交事实性元数据、自己的导览文字和必要的歌名发音提示，lyric 保持为空。
- 修正粤拼、例句或文化资料时，请在 Pull Request 中写明依据；引用外部资料时说明来源和许可。
- 提交贡献即表示你有权提供该贡献，并同意代码部分按 MIT License 授权；内容部分的授权需在 Pull Request 中明确。

## 隐私与安全

示例数据必须使用虚构账户。不要提交真实用户名、显示名、密码、Cookie、IP、数据文件或线上日志。安全问题请按照 SECURITY.md 私下报告。
