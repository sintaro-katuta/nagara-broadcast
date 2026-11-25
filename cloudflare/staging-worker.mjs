import worker from './worker.mjs';
import {makeStagingGate} from './staging-gate.mjs';

// Scheduled notifications are deliberately omitted from the preview.
export default makeStagingGate(worker);
