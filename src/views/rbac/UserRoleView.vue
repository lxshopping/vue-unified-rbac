<template>
  <section>
    <h2>用户角色</h2>
    <p><strong>local：</strong>User → Role 可以编辑。</p>
    <p><strong>sso：</strong>User → Role 来自 Keycloak，只读，不在 Vue 修改。</p>
    <p class="todo">TODO: 根据 authSource 切换“可编辑 / 只读”展示。</p>
  </section>
</template>
