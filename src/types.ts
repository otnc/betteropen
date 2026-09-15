/** A target application to launch, optionally with its own arguments. */
export type AppTarget = {
  /** Binary name (or names to try in order) as understood by the current platform. */
  readonly name: string | readonly string[]
  /** Arguments passed straight through to the app. */
  readonly arguments?: readonly string[]
}

export type Options = {
  /**
   * Wait for the opened app to exit before resolving.
   *
   * On Windows, an explicit `app` is required for this to work.
   *
   * @default false
   */
  readonly wait?: boolean
  /**
   * macOS only. Don't bring the app to the foreground.
   *
   * @default false
   */
  readonly background?: boolean
  /**
   * macOS only. Open a new instance of the app even if one is already running.
   * Other platforms always open a new instance.
   *
   * @default false
   */
  readonly newInstance?: boolean
  /**
   * The app (or apps, tried in order) to open the target with, instead of the platform default.
   */
  readonly app?: AppTarget | readonly AppTarget[]
  /**
   * Allow the launched app to exit with a nonzero code when `wait` is set, without rejecting.
   *
   * @default false
   */
  readonly allowNonzeroExitCode?: boolean
}

export type OpenAppOptions = Omit<Options, 'app'> & {
  readonly arguments?: readonly string[]
}

export type AppName =
  | 'chrome'
  | 'brave'
  | 'firefox'
  | 'edge'
  | 'safari'
  | 'opera'
  | 'vivaldi'
  | 'chromium'
  | 'browser'
  | 'browserPrivate'
