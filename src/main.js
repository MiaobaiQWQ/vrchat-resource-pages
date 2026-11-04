import './styles.css';
import { SourceManager } from './library/sources.js';
import { ArchiveClient } from './archives/client.js';
import { Catalog } from './library/catalog.js';
import { ImageService } from './images/service.js';
import { CoverQueue } from './covers/queue.js';
import { Shell } from './ui/shell.js';
import { Detail } from './ui/detail.js';
import { toast } from './ui/elements.js';

document.documentElement.dataset.theme = 'dark';
const sources = new SourceManager(), archives = new ArchiveClient(), catalog = new Catalog(sources, archives), images = new ImageService(), covers = new CoverQueue(catalog, images);
const app = { sources, archives, catalog, images, covers };
app.shell = new Shell(app); app.detail = new Detail(app);
app.shell.renderSources(); app.shell.render();
sources.init().catch(error => toast(error.message));
window.addEventListener('unhandledrejection', event => { console.error(event.reason); toast('操作未完成：' + (event.reason?.message || '请重试')); });
