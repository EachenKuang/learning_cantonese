# 第三方软件与外部服务

## msedge-tts

后端语音代理依赖 msedge-tts 2.0.7。该软件由 Migushthe2nd 发布，采用 MIT License：

- https://github.com/Migushthe2nd/MsEdgeTTS
- https://github.com/Migushthe2nd/MsEdgeTTS/blob/main/LICENSE

安装依赖时还会下载其传递依赖；分发包含 node_modules 的制品时，应同时保留各依赖自带的许可和版权声明。本仓库不提交 node_modules。

## Microsoft Edge Read Aloud

msedge-tts 调用 Microsoft Edge Read Aloud 的在线语音接口。MIT License 只覆盖客户端软件，不代表 Microsoft 对该在线服务作出授权、可用性或服务等级承诺。部署者应自行确认使用方式符合适用条款，并保留设备粤语语音等降级方案。

## Ackee

线上站点可选用自托管 Ackee 做匿名访问统计。Ackee 项目采用 MIT License：

- https://github.com/electerious/Ackee

## 外部音乐平台

歌曲导览会生成 Apple Music 搜索链接，方便用户寻找正版音源。本项目与 Apple Music、歌曲权利人及艺人不存在隶属或背书关系。
