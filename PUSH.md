# 推到 GitHub

仓库已经初始化好，首次提交也在本地做完了（分支 `main`，1 个提交）。
下面三条路，选一条。**不需要把 token 发给任何人。**

---

## 路线 A：命令行（推荐）

先在 GitHub 网页上建一个空仓库：<https://github.com/new>

- Repository name：`st-narrative-ledger`
- **不要**勾选 Add a README / .gitignore / license（本地已经有了，勾了会冲突）
- Public

然后在 `st-narrative-ledger` 目录里执行：

```bash
git remote add origin https://github.com/stasrsda/st-narrative-ledger.git
git branch -M main
git push -u origin main
```

第一次推送会弹出授权窗口：

- 选 **Sign in with your browser**（最省事，浏览器点一下就完事）
- 或者用 Personal Access Token 当密码（用户名填 `stasrsda`）

推成功之后，Windows 会记住凭据，以后 `git push` 不再问。

---

## 路线 B：GitHub CLI（最省事）

装完 `gh` 之后：

```bash
gh auth login          # 选 GitHub.com → HTTPS → 浏览器登录
gh repo create st-narrative-ledger --public --source=. --remote=origin --push
```

一条命令建仓库 + 推送。

---

## 路线 C：GitHub Desktop

1. 打开 GitHub Desktop → File → Add local repository → 选 `st-narrative-ledger`
2. 右上角 Publish repository
3. 取消勾选 "Keep this code private"

---

## 推完要检查三件事

**1. 世界包没被推上去**

`packs/beiliang.worldpack.json` 在 `.gitignore` 里，不该出现在仓库里。
到 GitHub 网页上看 `packs/` 目录，**应该只有 `guofeng.worldpack.json`**。

如果发现它上去了：

```bash
git rm --cached packs/beiliang.worldpack.json
git commit -m "chore: 移除私人世界包"
git push
```

**2. ST 能装上**

ST → 扩展（魔杖图标）→ Install extension → 粘：

```
https://github.com/stasrsda/st-narrative-ledger
```

**3. 装完菜单里有「叙事账本」**

点开 → 状态页 → 看「环境」五项是否都 ok。

---

## 以后更新

改完代码：

```bash
git add -A
git commit -m "说明这次改了什么"
git push
```

ST 里点「更新」（Update）就是 `git pull`。

**如果你在本地放了 `packs/beiliang.worldpack.json`，更新不会动它**——它在忽略列表里，`git pull` 不碰。
但如果你哪天 `git clean -fd`，它会被删。备份一份。

---

## 想在别的机器上继续用私人包

把 `beiliang.worldpack.json` 手动拷到新机器的
`extensions/third-party/st-narrative-ledger/packs/` 里就行。
