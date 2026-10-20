## File-based Routing

Routes will be auto-generated for Vue files in this dir with the same file structure.
Check out [Vue Router file-based routing](https://router.vuejs.org/file-based-routing/) for more details.

### Path Aliasing

`~/` is aliased to `./src/` folder.

For example, instead of having

```ts
import { isDark } from '../../../../composables'
```

now, you can use

```ts
import { isDark } from '~/composables'
```
