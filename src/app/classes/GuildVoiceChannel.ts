import type {
  AudioPlayer,
  createAudioPlayer,
  createAudioResource,
  DiscordGatewayAdapterCreator,
  entersState,
  JoinConfig,
  joinVoiceChannel,
  VoiceConnection,
} from '@discordjs/voice';
import { AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus } from '@discordjs/voice';
import { capitalize, omitObject, shortenId } from '../utils';
import type { IAudioPlayer } from './Assistant';
import { EventEmitter } from './EventEmitter';

const ConnectTimeout = 5000;
const ReconnectTimeout = 30_000;
const RejoinTryWait = 10_000;
const DisconnectWait = 5000;
const PlayTimeout = 5000;

function debugAudio(audio: PlayableAudio): object {
  return omitObject(audio, ['resource', 'message'], true);
}

type ClassType = 'connection' | 'player' | 'audio';

type Events = {
  debug: unknown[];
  error: [error: Error];
  join: [connection: VoiceConnection, rejoin: boolean];
  leave: [retry: boolean];
};

type Options = {
  debug: boolean;
  guildId: string;
};

type DI = {
  adapterCreator: DiscordGatewayAdapterCreator;
  createAudioPlayer: typeof createAudioPlayer;
  createAudioResource: typeof createAudioResource;
  joinVoiceChannel: typeof joinVoiceChannel;
  entersState: typeof entersState;
};

export type JoinOptions = {
  channelId: string;
  selfDeaf: boolean;
  selfMute: boolean;
};

export class GuildVoiceChannel extends EventEmitter<Events> implements IAudioPlayer {
  readonly #debug?: (type: ClassType, message: string, ...args: unknown[]) => void;
  readonly #guildId: string;
  readonly #di: DI;
  #willRejoin: boolean;
  #current?:
    | {
        readonly connection: VoiceConnection;
        readonly player: AudioPlayer;
        options: JoinOptions;
        queue: PlayableAudio[];
      }
    | undefined;

  constructor(options: Options, di: DI) {
    super();
    if (options.debug) {
      this.#debug = (type, message, ...args) => {
        const id = this.#current?.connection.joinConfig.channelId ?? '';
        this.emit('debug', `[V${type.slice(0, 1).toUpperCase()}:${shortenId(id)}] ${message}`, ...args);
      };
    }
    this.#guildId = options.guildId;
    this.#di = di;
    this.#willRejoin = false;
  }

  get active(): boolean {
    return !!this.#current;
  }

  get joinConfig(): JoinConfig | undefined {
    return this.#current?.connection.joinConfig;
  }

  destroy(): void {
    if (!this.#current) return;
    this.#willRejoin = false;
    this.#current.connection.removeAllListeners();
    this.#current.player.removeAllListeners();
    this.#current.player.stop();
    try {
      this.#current.connection.destroy();
    } catch {
      // already destroyed
    }
    this.#current = undefined;
    this.#debug?.('connection', 'Destroyed for good');
  }

  async join(options: JoinOptions): Promise<boolean> {
    if (this.#current) return false;
    const connection = this.#di.joinVoiceChannel({
      debug: !!this.#debug,
      guildId: this.#guildId,
      adapterCreator: this.#di.adapterCreator,
      ...options,
    });
    connection.on('debug', (message) => this.#debug?.('connection', message));
    connection.on('error', (error) => this.emit('error', this.#createError('connection', error)));
    try {
      await this.#di.entersState(connection, VoiceConnectionStatus.Ready, ConnectTimeout);
    } catch {
      return false;
    }
    const player = this.#di.createAudioPlayer({
      debug: !!this.#debug,
      behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
    });
    player.on('debug', (message) => this.#debug?.('player', message));
    player.on('error', (error) => this.emit('error', this.#createError('player', error)));
    player.on(AudioPlayerStatus.Idle, this.#onPlayed);
    const reset = (): void => {
      if (!this.#current) return;
      try {
        connection.destroy();
      } catch {
        // already destroyed
      }
      const options = this.#current.options;
      this.#current = undefined;
      this.#debug?.('connection', 'Destroyed');
      this.emit('leave', this.#willRejoin);
      if (!this.#willRejoin) return;
      this.#debug?.('connection', 'Will rejoin');
      setTimeout(() => {
        if (!this.#willRejoin) return;
        this.join(options).catch((error) => this.emit('error', this.#createError('connection', error)));
      }, RejoinTryWait);
    };
    let reconnecting = false;
    const onReconnecting = (): void => {
      if (reconnecting) return;
      reconnecting = true;
      this.#debug?.('connection', 'Reconnecting');
      // reconnecting or moving to another channel
      this.#di
        .entersState(connection, VoiceConnectionStatus.Ready, ReconnectTimeout)
        .then(() => {
          reconnecting = false;
          this.#debug?.('connection', 'Reconnected', connection.joinConfig);
          this.emit('join', connection, true);
          if (!this.#current) return;
          if (connection.joinConfig.channelId !== options.channelId) {
            this.stop();
            this.#debug?.('player', 'Queue cleared');
          }
          this.#current.options = {
            channelId: connection.joinConfig.channelId ?? options.channelId,
            selfDeaf: connection.joinConfig.selfDeaf,
            selfMute: connection.joinConfig.selfMute,
          };
        })
        .catch(reset);
    };
    connection.on(VoiceConnectionStatus.Signalling, onReconnecting);
    connection.on(VoiceConnectionStatus.Connecting, onReconnecting);
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      this.stop();
      this.#debug?.('connection', 'Disconnected');
      // https://discordjs.guide/voice/voice-connections.html#handling-disconnects
      Promise.race([
        this.#di.entersState(connection, VoiceConnectionStatus.Signalling, DisconnectWait),
        this.#di.entersState(connection, VoiceConnectionStatus.Connecting, DisconnectWait),
      ]).catch(reset);
    });
    connection.subscribe(player);
    this.#willRejoin = true;
    this.#current = { connection, player, options, queue: [] };
    this.#debug?.('connection', 'Connected', connection.joinConfig);
    this.emit('join', connection, false);
    return true;
  }

  rejoin(options: JoinOptions): boolean {
    if (!this.#current) return false;
    this.#current.options = options;
    return this.#current.connection.rejoin(options);
  }

  leave(): boolean {
    this.#willRejoin = false;
    if (!this.#current) return false;
    this.stop();
    this.#current.connection.disconnect();
    return true;
  }

  next(): boolean {
    if (!this.#current) return false;
    this.#current.player.stop();
    return true;
  }

  stop(): boolean {
    if (!this.#current) return false;
    this.#current.queue = [];
    this.#current.player.stop();
    return true;
  }

  play(audio: PlayableAudio): boolean {
    if (!this.#current) return false;
    const kickStart = this.#current.queue.push(audio) === 1;
    if (kickStart) this.#startToPlay(audio);
    audio.once('error', (error) => void this.emit('error', this.#createError('audio', error)));
    audio.generate();
    return true;
  }

  #startToPlay(audio: PlayableAudio): void {
    if (audio.resource) {
      this.#debug?.('audio', 'Already', debugAudio(audio));
      this.#tryToPlay(audio);
      return;
    }
    this.#debug?.('audio', 'Waiting', debugAudio(audio));
    const timer = setTimeout(() => {
      audio.off('ready', onReady);
      this.#debug?.('audio', 'Timeout', debugAudio(audio));
      this.#onPlayed();
    }, PlayTimeout);
    const onReady = (): void => {
      clearTimeout(timer);
      this.#debug?.('audio', 'Ready', debugAudio(audio));
      this.#tryToPlay(audio);
    };
    audio.once('error', () => {
      clearTimeout(timer);
      audio.off('ready', onReady);
      this.#onPlayed();
    });
    audio.once('ready', onReady);
  }

  #tryToPlay(audio: PlayableAudio): void {
    if (!this.#current) return;
    audio.emit('start');
    try {
      if (!audio.resource) throw new Error('No resource');
      this.#current.player.play(this.#di.createAudioResource(audio.resource));
    } catch (error) {
      this.#onPlayed();
      this.emit('error', this.#createError('audio', error));
    }
  }

  #onPlayed = (): void => {
    if (!this.#current) return;
    const playedAudio = this.#current.queue.shift();
    if (!playedAudio) return;
    playedAudio.emit('end');
    const nextAudio = this.#current.queue[0];
    if (nextAudio !== undefined) this.#startToPlay(nextAudio);
  };

  #createError(type: ClassType, cause: unknown): Error {
    let message = `${capitalize(type)}:${this.#guildId}`;
    const channelId = this.#current?.connection.joinConfig.channelId;
    if (channelId) message += `:${channelId}`;
    return new Error(message, { cause });
  }
}
