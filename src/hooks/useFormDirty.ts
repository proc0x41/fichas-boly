import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

/**
 * Detecta se um formulário tem alterações não salvas comparando seus valores
 * atuais com um snapshot tirado no momento da carga / do último save.
 *
 * Uso:
 * ```ts
 * const values = { nome, email, contatos }
 * const { dirty, dirtyRef, markSaved } = useFormDirty(values, { isLoading })
 *
 * // após save bem-sucedido:
 * markSaved()
 *
 * // render do guard:
 * <UnsavedChangesGuard dirty={dirty} dirtyRef={dirtyRef} onSave={...} />
 * ```
 *
 * `dirtyRef` é atualizado sincronamente a cada render e dentro de `markSaved`,
 * para que `navigate()` chamado no mesmo tick logo após `markSaved()` enxergue
 * o estado já limpo (o setState do snapshot ainda não terá sido processado).
 *
 * Compara via `JSON.stringify` — barato pros formulários pequenos do app.
 */
export function useFormDirty<T>(
  values: T,
  opts: { isLoading?: boolean } = {},
): { dirty: boolean; dirtyRef: MutableRefObject<boolean>; markSaved: () => void } {
  const current = JSON.stringify(values)
  const [saved, setSaved] = useState(current)
  const initializedRef = useRef(false)
  const dirtyRef = useRef(false)

  // Quando `isLoading` transiciona de true para false (ou já é false no mount),
  // captura o snapshot inicial uma vez só.
  useEffect(() => {
    if (!opts.isLoading && !initializedRef.current) {
      initializedRef.current = true
      setSaved(current)
    }
    // current não entra como dep — só queremos rodar quando isLoading muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.isLoading])

  const dirty = initializedRef.current && current !== saved
  // Atualiza sincronamente o ref a cada render para o useBlocker enxergar
  // o valor mais novo mesmo quando navigate() é chamado logo após markSaved.
  dirtyRef.current = dirty

  const markSaved = useCallback(() => {
    dirtyRef.current = false
    setSaved(JSON.stringify(values))
  }, [values])

  return { dirty, dirtyRef, markSaved }
}
