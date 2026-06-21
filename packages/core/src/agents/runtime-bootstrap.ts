// Side-effect imports: keep the live agent runtimes on the same tool registry
// surface so single-agent and swarm mode do not drift apart silently.
import './filesystem-tools.js';
import './shell-tools.js';
import './data-tools.js';
import './signal-tools.js';
import './fem-tools.js';
import './deliverable-tools.js';
import './ground-model-tools.js';
import './skill-tools.js';
