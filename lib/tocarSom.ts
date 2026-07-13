// Som de notificação sintetizado via Web Audio API — evita depender de um
// arquivo de áudio (asset binário) só para um "ding" curto. Se o navegador
// bloquear (autoplay/sem interação prévia do usuário na página), falha em
// silêncio: o toast visual continua funcionando normalmente.
export function tocarSomNotificacao() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()

    const tocarTom = (frequencia: number, inicio: number, duracao: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequencia
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + inicio + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + inicio)
      osc.stop(ctx.currentTime + inicio + duracao)
    }

    // Duas notas curtas (ding-dong), sobem em tom pra soar como um alerta positivo
    tocarTom(880, 0, 0.15)
    tocarTom(1175, 0.12, 0.22)

    setTimeout(() => ctx.close(), 500)
  } catch (err) {
    console.warn('Não foi possível tocar som de notificação:', err)
  }
}
