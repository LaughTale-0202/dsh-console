# dsh-console — deepseek-harness 快速管理控制台

双击 **`启动.bat`**（或 `start.bat`）即用。这是一个纯 Windows 控制台小程序，负责帮你**启动、重启、停止、配置**本机的
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（以下简称 dsh）Web 服务，并提供插件管理与默认模型配置。

> 面向非资深用户设计：所有操作都走菜单/向导，不需要手敲命令行。

---

## 一、首次使用（从零环境）

1. 把整个 `dsh-console` 文件夹放到任意位置（不需要放在 dsh 目录里）。
2. 双击 `启动.bat`。
   - 若本机没有满足版本的 Node.js（需 `22.19+` 或 `24+`），会自动下载便携版 Node 到 `%LOCALAPPDATA%\dsh-console\runtime`，**无需管理员权限**。
   - 首次运行会进入四步向导：
     1. **项目位置** —— 浏览或粘贴你的 `deepseek-harness` 项目路径（验证根目录的 `package.json`/`apps/cli`）。
     2. **环境检查** —— 确认 Node 已就绪。
     3. **安装与构建** —— 首次会自动执行 `pnpm install` 与 `pnpm run build`（之后按需跳过）。
     4. **默认模型（可选）** —— 现在或稍后设置新会话使用的默认模型（如 GLM）。
3. 向导完成后回到主界面，选择 **启动服务**。

之后每次双击 `启动.bat` 即可直接进入主菜单启动服务。

---

## 二、主界面功能

| 菜单 | 说明 |
|---|---|
| **启动服务** | 端口占用检查 → 按需 install/build → 启动 `dsh web`。占用端口的旧进程会被自动结束。 |
| **重启服务** | 停止后重新启动。 |
| **停止服务** | 结束占用服务端口的进程树。 |
| **插件管理** | 分「系统/自定义」两栏展示启动时加载的插件；空格启停；改动重启后生效。 |
| **模型与凭据** | 配置新会话默认模型提供方（端点 + API Key，其余自动完成）。 |
| **启动预设（内网）** | 关闭遥测上报、注入 CA 证书、设置代理与镜像源。 |
| **项目更新** | `git pull --ff-only` → install → build →（可选）重启。 |
| **日志与快捷打开** | 打开 Web UI / 项目目录 / `~/.dsh` / 工具日志目录。 |
| **工具设置** | 修改项目路径 / 端口 / 自动开浏览器，创建桌面快捷方式。 |

键盘：`↑↓` 移动，`Enter` 确认，`Esc` 返回/取消，主界面 `q` 退出。插件页 `Tab` 切换 系统/自定义 分组，`空格` 启停。

---

## 三、默认模型配置（新会话用哪个模型）

服务**未启动过时**，`~/.dsh/settings.yaml`、`~/.dsh/.credentials.yaml` 可能还不存在。控制台会先完成一次构建并启动，生成这些文件后再按你的设置写入，随后重启即可。

进入 **模型与凭据**：

1. **配置自定义提供方**：只需输入 OpenAI 兼容的端点 URL（如 GLM 网关 `https://…/v1`）与 API Key。
   - 自动调用 `GET {base}/models` 拉取模型列表供你挑选默认模型（端点不支持时改为手动输入模型 id）。
   - 自动写入三处（均保留你原有的其它配置与注释）：
     - `~/.dsh/.credentials.yaml` → `refs.<X>_API_KEY`
     - `~/.dsh/settings.yaml` → `llm-pi-ai.providers.<route>`（api/baseURL/apiKeyEnv/models）与 `agent-default-model`
2. **配置 DeepSeek 官方 Key**：只需填 `DEEPSEEK_API_KEY`。
3. **清除自定义提供方**：删除该工具加的自定义路由与默认。

配置即时生效（dsh 对两个文件热加载），正在运行的服务无需重启。

---

## 四、插件管理

- **系统插件**：随 dsh 仓库安装的官方组件（`@deepseek-ai/dsh-*`），显示英文 id 与其 package 描述。
- **自定义插件**：非仓库内、额外安装/插入的插件。
- 对某行按 `空格`：
  - 启用 → 停用：写入 `disabled: true`；核心行（如 `session`/`llm`/`tools`）会二次确认，避免把服务改坏。
  - 停用 → 启用：删除对应停用覆盖；官方默认关闭的行用 `disabled: false` 强制启用。
- 所有启停意图缓存于本工具 `config.json`（`plugins.disabled`），下次仍能找到；真正的改动写入
  `data\plugins.cordis.yml`，并在**下一次启动服务**时作为 `--patch` 叠加层传给 `dsh web`。

---

## 五、内网 / 离线预设

在 **启动预设（内网）** 打开总开关后可配置：

- **关闭遥测上报**：注入 `DSH_TELEMETRY_MODE=DISABLED` / `DSH_TELEMETRY_DISABLED=1`。
- **CA 证书**：填入 PEM 路径（注入 `NODE_EXTRA_CA_CERTS`），或点「从 Windows 证书库导出根证书」一键生成 `data\root-ca.pem`。
- **代理**：HTTP/HTTPS/NO_PROXY，启动服务时注入；可「同步到 `~/.dsh/.env`」让手动启动也生效。
- **镜像源**：npm / corepack 镜像与 Node 安装包直链，仅安装/构建时生效（写入 `NPM_CONFIG_REGISTRY`、`COREPACK_NPM_REGISTRY`）。

> 说明：项目内的 `.env` 放代理会被 dsh 官方拒绝，故同步到 `~/.dsh/.env`。验证完请记得关闭预设以免影响日常使用。

---

## 六、`~/.dsh` 相关文件角色

| 文件 | 角色 | 工具是否写入 |
|---|---|---|
| `settings.yaml` | 各功能命名空间（`agent-default-model`、`llm-pi-ai` 等） | ✅ 模型配置 |
| `.credentials.yaml` | `refs` 里的 API Key / 密钥（dsh 持 600 权限） | ✅ 存 Key |
| `.env` | 可选的启动环境变量回退层 | ✅ 内网代理同步 |
| `profiles/…/cordis.patch.yml` | 每 profile 官方默认插件开关 | ❌ 只读 |
| `cordis.patch.yml`（home） | 机器级插件覆盖 | ❌（工具用 `--patch` 叠加层） |

**本工具目录不含任何机密**：`config.json` 只存「是否已设置过 Key」，不存明文。

---

## 七、常见问题

- **启动报错**：进入「日志与快捷打开 → 打开工具日志目录」，查看 `data\logs\*.log`（install/build 实时落盘）。
- **上次操作中断**：启动时会提示存在未完成标记 `data\in-flight.json`，可先看日志再重试。
- **改了插件/模型不生效**：插件改动需**重启服务**（页面内会询问）；模型配置一般即时生效。
- **不小心删了 `config.json`**：相当于首次运行，重新走一次向导即可；不会影响 `~/.dsh` 里已有的数据。

---

## 八、开发

```
npm test          # 单元测试（node:test，进程内运行）
```

目录结构：`bootstrap\check-env.ps1`（引导 Node）、`app\main.js`（入口装配）、`app\core\*`（config/lifecycle/pipeline/plugins/model/presets…）、
`app\pages\*`（各功能页）、`app\ui\*`（ANSI 无框 TUI 层）。工具自身缓存写入 `config.json` 与 `data\`（均已 gitignore）。
