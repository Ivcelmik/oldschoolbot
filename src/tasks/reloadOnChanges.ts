import { sep, extname, basename, join } from 'path';
import { Task, KlasaClient, TaskStore, Stopwatch, Piece } from 'klasa';
import { watch } from 'chokidar';

const nodeModules = `${sep}node_modules${sep}`;

export default class extends Task {
	private _running = false;

	public constructor(client: KlasaClient, store: TaskStore, file: string[], directory: string) {
		super(client, store, file, directory);
		this.enabled = !this.client.production;
	}

	async run() {}

	async reloadPiece(name: string, _path: string, piece?: Piece) {
		const timer = new Stopwatch();

		for (const module of Object.keys(require.cache)) {
			if (!module.includes(nodeModules) && extname(module) !== '.node') {
				delete require.cache[module];
			}
		}

		let log;
		const reload = this.client.commands.get('reload');
		if (!reload) return;
		if (piece) {
			// @ts-ignore
			await reload.run({ sendLocale: () => null, sendMessage: () => null }, [piece]);
			log = `Reloaded it in ${timer}`;
		} else {
			// @ts-ignore
			await reload.everything({
				sendLocale: () => null,
				sendMessage: () => null
			});
			log = `Reloaded everything in ${timer}.`;
		}

		timer.stop();
		this.client.emit('log', `${name} was updated. ${log}`);
		return null;
	}

	async init() {
		if (this.client._fileChangeWatcher) return;
		this.client._fileChangeWatcher = watch(join(process.cwd(), 'dist/**/*.js'), {
			persistent: true,
			ignoreInitial: true
		});

		const reloadStore = async (_path: string) => {
			const store = _path.split(sep).find(dir => this.client.pieceStores.has(dir));

			const name = basename(_path);

			if (!store) {
				if (this._running) return;
				this._running = true;
				await this.reloadPiece(name, _path);
				this._running = false;
				return;
			}

			const piece = this.client.pieceStores.get(store).get(name.replace(extname(name), ''));

			await this.reloadPiece(name, _path, piece);
		};

		for (const event of ['add', 'change', 'unlink']) {
			if (this.client._fileChangeWatcher) {
				this.client._fileChangeWatcher.on(event, reloadStore);
			}
		}
	}
}
