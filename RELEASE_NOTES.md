首个公开版本，适配 Windows 上的 DeepSeek Harness 0.2.1-rc.3。

- DSH 已配置模型、自定义 API、手动回答三个检测入口。
- 内置 64 个模型的参考指纹；三次独立采样，支持进度、取消和 JSON 报告导出。
- 集成 Model Check Core 协议检查，可选安装 Python 依赖。
- 保留规则来源、固定版本和开源许可证。

安装：DSH → 插件 → 添加插件 → 安装第三方插件，填写：

```text
github:changhuidao-arch/dsh-model-check#v1.0.0
```

也可下载 ZIP 解压后安装该目录，或用 DSH CLI 安装 TGZ 包。

行为指纹只反映库内相似度，不能证明后台模型身份。三次真实 DSH 采样与导出已验证，12 项自动化测试通过；其他平台、版本和完整公网协议检测范围见 [验证记录](https://github.com/changhuidao-arch/dsh-model-check/blob/v1.0.0/VALIDATION.md)。
