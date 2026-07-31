# 软件内更新源配置与发版指南

## 目标

让所有用户（尤其是国内用户）都能在软件内一键更新，无需手动去 GitHub 下载。

实现方式：**Gitee 国内源优先 + GitHub 镜像/GitHub 直连自动降级 + 手动下载兜底**。

## 1. 准备工作：创建 Gitee 仓库

Gitee 是国内代码托管平台，访问速度快且稳定，适合作为更新源。

1. 访问 https://gitee.com 并注册/登录账号。
2. 新建一个公开仓库：
   - 仓库名称建议：`inventory-desktop`
   - 是否开源：选择**公开**（否则未授权用户无法通过 API 获取 release）
3. 记录你的 Gitee 用户名和仓库名，稍后填写到代码中。

## 2. 修改代码中的 Gitee 配置

打开 `electron/updater.js`，找到顶部配置：

```js
const GITEE_OWNER = 'xc2331' // 修改为你的 Gitee 用户名
const GITEE_REPO = 'inventory-desktop' // 修改为你的 Gitee 仓库名
```

把 `'xc2331'` 和 `'inventory-desktop'` 改成你自己的 Gitee 用户名和仓库名。

> GitHub 配置（`GITHUB_OWNER`、`GITHUB_REPO`）通常不需要改，保持现有 GitHub 仓库即可。

## 3. 发版流程（每次发布新版本时执行）

### 3.1 在 GitHub 发布

1. 运行打包命令：
   ```bash
   npm run release:win
   ```
2. 进入 `release-v*` 目录（具体目录见 `package.json` 中 `build.directories.output`）。
3. 确认生成两个文件：
   - `Family Inventory X.Y.Z.exe`
   - `update-info.json`
4. 在 GitHub 仓库创建 Release，上传上述两个文件。

### 3.2 在 Gitee 同步发布

1. 登录 Gitee，进入对应仓库。
2. 点击「发行版」→「创建发行版」。
3. Tag 名称必须与 GitHub 一致，例如：`v1.1.1`。
4. 标题随便写，例如：`v1.1.1`。
5. 上传同样的两个文件：
   - `Family Inventory X.Y.Z.exe`
   - `update-info.json`
6. 点击「创建」。

> 小提示：Gitee Release 的附件大小有上限（通常 100MB），如果安装包超过限制，可开启 Gitee LFS 或分卷压缩后上传。对大多数 Electron portable 应用来说通常足够。

## 4. 更新逻辑说明

软件启动后（延迟 8 秒）会自动检查更新，用户也可以在「设置 → 软件更新」中手动检查。

检查顺序：

1. **Gitee 国内源**（默认首选）
2. `mirror.ghproxy`
3. `ghfast.top`
4. **GitHub 直连**

只要任一源成功返回 `update-info.json`，就会使用该源下载并安装。如果全部失败，会提示用户手动下载，并提供 Gitee / GitHub Releases 页面链接。

## 5. 用户侧设置

用户可以在「设置 → 软件更新 → 更新源」中切换首选源：

- 国内用户：选择「Gitee 国内源（推荐）」
- 海外用户：选择「GitHub 直连」
- 网络不稳定时：可尝试 mirror.ghproxy / ghfast.top

无论选择哪个首选源，失败后都会自动尝试其他源。

## 6. 常见问题

### Q1：为什么 Gitee 源检查失败？

可能原因：

- Gitee 仓库不是公开的 → 改为公开仓库。
- Gitee 仓库没有创建对应 Tag 的 Release → 按第 3 步上传。
- Release 中缺少 `update-info.json` → 务必同时上传 exe 和 json。
- Gitee API 请求频率限制 → 稍后再试。

### Q2：GitHub 镜像源仍然失败？

ghproxy / ghfast.top 是第三方公益镜像，稳定性不受我们控制。Gitee 源是我们自己的仓库，更稳定，推荐国内用户优先使用。

### Q3：手动下载后怎么安装？

下载新的 `.exe` 后，关闭当前运行的软件，用新 exe 替换旧 exe 即可（portable 版本无需安装）。

## 7. 自动化建议（可选）

每次手动同步 GitHub → Gitee 比较繁琐，可以：

- 使用 Gitee 的「仓库镜像管理」功能，自动同步 GitHub 仓库代码。
- 但每次 Release 附件（exe 和 update-info.json）仍需手动上传到 Gitee。
- 也可以使用 GitHub Actions + Gitee API 实现自动同步 release assets（需要 Gitee 私人令牌）。
