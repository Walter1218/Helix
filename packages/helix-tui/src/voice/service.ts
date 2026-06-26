import * as trace from "../trace"

export interface VoiceConfig {
  language: string
  continuous: boolean
  interimResults: boolean
}

export interface SpeechOptions {
  language?: string
  rate?: number
  pitch?: number
}

export interface VoiceService {
  startRecognition(): Promise<void>
  stopRecognition(): Promise<void>
  speak(text: string, options?: SpeechOptions): Promise<void>
  stopSpeaking(): void
  onResult(callback: (text: string) => void): void
  onInterim(callback: (text: string) => void): void
  configure(config: VoiceConfig): void
  readonly isListening: boolean
  readonly isSpeaking: boolean
}

export class VoiceServiceImpl implements VoiceService {
  private recognition: any = null
  private synthesis: any = null
  private _isListening = false
  private _isSpeaking = false
  private config: VoiceConfig
  private resultCallbacks: Set<(text: string) => void> = new Set()
  private interimCallbacks: Set<(text: string) => void> = new Set()

  constructor() {
    this.config = {
      language: "zh-CN",
      continuous: false,
      interimResults: false,
    }
  }

  get isListening(): boolean {
    return this._isListening
  }

  get isSpeaking(): boolean {
    return this._isSpeaking
  }

  configure(config: VoiceConfig): void {
    this.config = config
  }

  async startRecognition(): Promise<void> {
    if (this._isListening) return

    trace.emit("ui.init", "info", "Starting voice recognition", { language: this.config.language })
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        throw new Error("Speech recognition not supported")
      }

      this.recognition = new SpeechRecognition()
      this.recognition.continuous = this.config.continuous
      this.recognition.interimResults = this.config.interimResults
      this.recognition.lang = this.config.language

      this.recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1]
        if (result.isFinal) {
          this.resultCallbacks.forEach((cb) => cb(result[0].transcript))
        } else {
          this.interimCallbacks.forEach((cb) => cb(result[0].transcript))
        }
      }

      this.recognition.onerror = (event: any) => {
        trace.emit("ui.error", "error", "Voice recognition error", { error: event.error })
        console.error("Speech recognition error:", event.error)
        this._isListening = false
      }

      this.recognition.onend = () => {
        this._isListening = false
      }

      this.recognition.start()
      this._isListening = true
    } catch (error) {
      trace.emit("ui.error", "warn", "Voice recognition not available", { error: String(error) })
      console.warn("Voice recognition not available:", error)
    }
  }

  async stopRecognition(): Promise<void> {
    trace.emit("ui.init", "info", "Stopping voice recognition")
    if (this.recognition) {
      this.recognition.stop()
      this._isListening = false
    }
  }

  async speak(text: string, options?: SpeechOptions): Promise<void> {
    if (this._isSpeaking) {
      this.stopSpeaking()
    }

    trace.emit("ui.init", "info", "Speaking text", { length: text.length, language: options?.language })
    try {
      this.synthesis = window.speechSynthesis
      if (!this.synthesis) {
        throw new Error("Speech synthesis not supported")
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = options?.language || this.config.language
      utterance.rate = options?.rate || 1
      utterance.pitch = options?.pitch || 1

      return new Promise((resolve, reject) => {
        utterance.onend = () => {
          this._isSpeaking = false
          resolve()
        }
        utterance.onerror = (event: any) => {
          trace.emit("ui.error", "error", "Voice synthesis error", { error: event.error })
          this._isSpeaking = false
          reject(event.error)
        }
        this.synthesis.speak(utterance)
        this._isSpeaking = true
      })
    } catch (error) {
      trace.emit("ui.error", "warn", "Voice synthesis not available", { error: String(error) })
      console.warn("Voice synthesis not available:", error)
    }
  }

  stopSpeaking(): void {
    trace.emit("ui.init", "info", "Stopping speech")
    if (this.synthesis) {
      this.synthesis.cancel()
      this._isSpeaking = false
    }
  }

  onResult(callback: (text: string) => void): void {
    this.resultCallbacks.add(callback)
  }

  onInterim(callback: (text: string) => void): void {
    this.interimCallbacks.add(callback)
  }
}
