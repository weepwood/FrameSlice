import { inspectContainer, executeContainerTask } from '../lib/container-ops'
import type { ContainerOptions, ContainerInspection, ContainerOutput } from '../lib/container-ops'

type Command =
  | { kind: 'scan'; id: number; file: File }
  | { kind: 'run'; id: number; options: Omit<ContainerOptions, 'signal' | 'onProgress' | 'onFileStart' | 'onOutput'> }
  | { kind: 'cancel'; id: number }

type Reply =
  | { kind: 'scanDone'; id: number; data: ContainerInspection }
  | { kind: 'progress'; id: number; fraction: number; label: string }
  | { kind: 'started'; id: number; filename: string }
  | { kind: 'output'; id: number; result: ContainerOutput }
  | { kind: 'done'; id: number; count: number }
  | { kind: 'error'; id: number; canceled: boolean; message: string }

const scope = self as unknown as {
  postMessage: (message: Reply) => void
  onmessage: ((message: MessageEvent<Command>) => void) | null
}
let current: { id: number; abort: AbortController } | null = null
const send = (reply: Reply) => scope.postMessage(reply)

scope.onmessage = (event: MessageEvent<Command>) => {
  const message = event.data
  if (message.kind === 'cancel') {
    if (current?.id === message.id) current.abort.abort()
    return
  }
  if (current) return
  const abort = new AbortController()
  current = { id: message.id, abort }
  const handle = async () => {
    try {
      if (message.kind === 'scan') {
        const data = await inspectContainer(message.file)
        if (!abort.signal.aborted) send({ kind: 'scanDone', id: message.id, data })
      } else {
        const results = await executeContainerTask({
          ...message.options,
          signal: abort.signal,
          onProgress: (fraction, label) => send({ kind: 'progress', id: message.id, fraction, label }),
          onFileStart: filename => send({ kind: 'started', id: message.id, filename }),
          onOutput: result => send({ kind: 'output', id: message.id, result }),
        })
        if (!abort.signal.aborted) send({ kind: 'done', id: message.id, count: results.length })
      }
    } catch (error) {
      send({ kind: 'error', id: message.id, canceled: abort.signal.aborted,
        message: error instanceof Error ? error.message : String(error) })
    } finally {
      current = null
    }
  }
  void handle()
}
