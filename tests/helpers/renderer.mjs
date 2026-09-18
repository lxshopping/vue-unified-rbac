import { createRenderer, nextTick } from 'vue'

// Vue's real component/reactivity runtime against an inspectable host tree.
export function mountView(component, plugins) {
  const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null })
  const renderer = createRenderer({
    createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (item, text) => { item.text = text },
    setElementText: (item, text) => { item.text = text; item.children = [] },
    parentNode: item => item.parent,
    nextSibling: item => item.parent?.children[item.parent.children.indexOf(item) + 1] ?? null,
    patchProp: (item, key, previous, next) => { item.props[key] = next },
    insert(item, parent, anchor = null) {
      if (item.parent) item.parent.children.splice(item.parent.children.indexOf(item), 1)
      item.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index < 0) parent.children.push(item)
      else parent.children.splice(index, 0, item)
    },
    remove(item) {
      if (item.parent) item.parent.children.splice(item.parent.children.indexOf(item), 1)
      item.parent = null
    },
  })
  const root = node('root')
  const app = renderer.createApp(component)
  for (const plugin of plugins) app.use(plugin)
  app.mount(root)
  function all(type, item = root) { return [...(item.type === type ? [item] : []), ...item.children.flatMap(child => all(type, child))] }
  function text(item = root) { return item.text + item.children.map(text).join(' ') }
  return { app, root, all, text, async click(label) {
    const button = all('button').find(item => text(item) === label)
    if (!button) throw new Error('Missing button: ' + label)
    if (button.props.disabled) throw new Error('Disabled button: ' + label)
    await button.props.onClick()
    await flush()
  } }
}
export async function flush() {
  await new Promise(resolve => setImmediate(resolve))
  await nextTick()
}
