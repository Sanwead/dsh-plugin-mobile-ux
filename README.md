# DSH Mobile UX

A Cordis bundle that makes the DeepSeek Harness web UI easier to use on phones.

- Keeps the composer visible when the keyboard opens on iOS and Android.
- Makes sidebar conversations selectable with one tap.
- Closes the sidebar after selection on narrow screens and smooths the transition.

## Install

Download `dsh-plugin-mobile-ux-0.1.0.tgz` from the GitHub release and run:

```sh
dsh plugin --profile web add ./dsh-plugin-mobile-ux-0.1.0.tgz
```

## Configuration

| Option | Default |
| --- | --- |
| `enabled` | `true` |
| `narrowBreakpoint` | `1024` px |
| `tapClickDelayMs` | `60` ms |
| `slideDistancePx` | `48` px |

The viewport adjustment disables pinch-to-zoom. The sidebar and iOS keyboard fixes depend on DSH's current UI markup.

[MIT](LICENSE)
