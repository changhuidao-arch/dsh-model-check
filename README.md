# DSH 模型指纹插件

面向 DeepSeek Harness 的本地插件。左侧“模型指纹”提供三个入口：

- **DSH 已配置模型**：复用 DSH 正常认证与路由，连续发送三条独立挑战，本地比对行为指纹。不会把当前聊天、系统提示词或工具列表加入挑战。
- **自定义 API**：支持 OpenAI Chat Completions、Responses 和 Anthropic Messages。密钥仅在本次检测内存中使用，提交后清空输入框；不存配置、不写磁盘、不传给指纹库网站。
- **手动回答比对**：生成三条挑战，粘贴原始回答后离线判分。

可导出 JSON 报告、查看前三条采样和前八个候选、取消检测。只保留当前 DSH 进程内最近十次任务，退出后不保留。指纹请求会按原渠道规则计费。

## 安装

已验证版本：DSH `0.2.1-rc.3`（Windows）。Node 运行时要求 22+，DSH 自带运行时符合要求。其他版本和操作系统尚未实测。

1. DSH 左侧“插件” → “添加插件” → “安装第三方插件”。
2. 填写 `github:changhuidao-arch/dsh-model-check#v1.0.0`。
3. 安装完成后刷新插件面板，左侧打开“模型指纹”。

命令行安装到桌面 profile：

```powershell
dsh plugin --profile desktop add github:changhuidao-arch/dsh-model-check#v1.0.0
```

插件已包含可运行 JavaScript 和指纹数据，安装时不需要构建。也可下载 [v1.0.0 源码压缩包](https://github.com/changhuidao-arch/dsh-model-check/archive/refs/tags/v1.0.0.zip)，解压到固定目录，在“安装第三方插件”中填写该目录绝对路径；或者进入目录执行：

```powershell
& .\scripts\install.ps1
```

本地目录安装采用 link 引用，请保留目录。需要启用 **Model Check Core 接口兼容性检查** 时，在实际安装目录一次性执行：

```powershell
& .\scripts\setup-python.ps1
```

需要 Python 3.10+。它会在插件目录创建 `.venv` 并安装固定版本依赖。默认三次行为指纹不依赖 Python。可用 `DSH_MODEL_CHECK_PYTHON` 指定 Python 可执行文件。卸载可从 DSH 插件面板完成。

## 对话使用

宿主的 tools 服务可用时，插件注册 `model_fingerprint_check` 工具；页面底部显示加载状态。可在 DSH 对话里说：

> 用模型指纹插件检测我配置的 gpt-6.1-terra，检测完成后说明参考库是否覆盖它，以及前三个相近候选。

工具先 `list` 获取真实提供商与模型 ID，再 `start`、`status`；只允许使用已配置的模型，不接受密钥。页面也可直接选择模型后点击“开始检测”。每轮三条请求各最多等待 120 秒；同一时间只运行一轮。

## 判读

- “最接近声明模型”只表示参考库中这个候选排名第一。
- “最接近其他模型”是需要复测的线索，不能直接断定供应商换模。
- “参考库未覆盖此模型名”不会强行归并日期、版本、档位或别名；仍展示近似候选。
- 三份有效样本不足、请求错误、缺少结束帧或回答不符合数字任务时，结果明确为证据不足。
- 库内概率是在已有候选中的相对概率，**不是身份为真的概率**。系统提示、推理参数和渠道路由变化均可能影响结果。

自定义 API 可额外勾选原项目的协议兼容性检查，包括连通性、回显、流式结构、工具调用、视觉等适用探针。它按原项目能力规则执行，保持原有公网地址限制。原项目目前不支持 Responses 的完整协议检查；这不会影响 Responses 行为指纹。接口检查通过也不代表模型身份已认证。

DSH 模型模式使用 DSH 适配器，没有原始响应头，因而不将适配器加工后的数据冒充原始协议检测。需要原始检查时使用自定义 API。

## 规则来源与维护

- [Model Check Core](https://github.com/dufeisolo/model-check-core)：2026-10-27 提交 `b1ad2904`，原样保留 Python 核心。
- [LM Fingerpoint Detector](https://github.com/Ikaleio/lm-detector)：2026-11-02 提交 `fc719aab`，`lmfpd-sdk@0.2.0`；内置 64 个模型，参考库构建时间 2026-10-27。
- 对比了 [ModelTrace](https://github.com/xqy2006/ModelTrace)，本插件采用其后续项目 lm-detector 的更广参考库及共享判分实现。

规则已随安装包固定，不在后台自动下载或执行远端更新。更新时须将同一上游版本的 SDK、参考库和 detector 一起验证后打包，不能只替换模型名称或伪造参考数据。文件摘要与具体提交见 `sources.json`，第三方许可见 `NOTICE`。

## 开发验证

```powershell
node --test tests/*.test.js
```

测试包括真实参考数据判分、未知型号、样本不足、DSH 流式完成/错误、取消、RPC 权限、密钥清理与接口协议构造。模拟接口测试只证明插件传输与逻辑，不证明某个实际供应商的模型身份。

测试中的 Python 用例需要先安装 `python/requirements.txt` 依赖；Windows 可运行 `scripts/setup-python.ps1`。实际验证范围见 [VALIDATION.md](./VALIDATION.md)。

## 发布方式

DSH 支持直接从 GitHub、npm 或本地包安装。本项目通过 GitHub Releases 发布。更新时同步修改 `package.json`、代码中的版本号和 `RELEASE_NOTES.md`，推送到 `main`；发布工作流会运行测试、打包、创建版本 tag 并上传 TGZ、ZIP 和 SHA-256 摘要，已有版本不会被覆盖。也可在 Actions 手动运行。安装方可以固定 tag 或提交，避免源码更新悄悄改变规则。

公开仓库不等于自动加入插件市场。需要在 DSH“发现”页展示时，还要将版本登记到用户添加的插件索引；DSH 当前不内置索引源。具体格式参见 [官方打包与安装说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md) 和 [插件索引说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.zh.md)。
