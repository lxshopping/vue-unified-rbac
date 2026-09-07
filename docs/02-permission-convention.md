# Permission Code 命名规则

统一使用：

```text
<app>.<resource>.<action>
```

## 示例

```text
release.order.view
release.order.create
release.order.update
release.order.approve
release.order.reject
release.order.deploy
release.order.rollback
release.order.cancel

release.app.view
release.app.create
release.app.update
release.app.delete

k8s.pod.view
k8s.pod.log
k8s.pod.exec
k8s.pod.delete
```

## 原则

1. 全小写。
2. 使用 `.` 分层，不混用 `-`、`_` 表示层级。
3. Permission 表示“业务动作”，不局限于 CRUD。
4. `view/create/update/delete` 用于标准 CRUD。
5. `approve/deploy/rollback/exec/log` 等直接使用业务动词。
6. 不把 DRF 的 `list/retrieve/destroy` 直接暴露成业务 permission code。
7. 不使用 `admin.xxx` 这种角色型权限名。
8. code 一旦投入使用尽量保持稳定，名称/描述可以修改，code 不轻易改。
