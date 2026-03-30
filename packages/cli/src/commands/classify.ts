import { Command } from 'commander';
import { classifyRMR89, classifyUSCS, classifyQSystem } from '@geotechcli/core';
import { heading, keyValue, renderSteps, renderJSON, success } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { writeFileSync } from 'node:fs';

export function registerClassifyCommand(program: Command): void {
  const classify = new Command('classify')
    .description('Rock and soil classification (rmr, uscs, q-system)');

  // --- RMR89 ---
  const rmrCmd = new Command('rmr')
    .description('Rock Mass Rating (Bieniawski 1989)')
    .requiredOption('--ucs <MPa>', 'Uniaxial compressive strength (MPa)', parseFloat)
    .requiredOption('--rqd <percent>', 'Rock Quality Designation (%)', parseFloat)
    .option('--spacing <m>', 'Discontinuity spacing (m)', parseFloat, 0.3)
    .option('--condition <type>', 'Joint condition: very_good|good|fair|poor|very_poor', 'fair')
    .option('--gw <type>', 'Groundwater: dry|damp|wet|dripping|flowing', 'dry')
    .option('--orientation <adj>', 'Orientation adjustment (-60 to 0)', parseFloat, 0)
    .action((opts) => {
      const flags = getGlobalFlags(opts);

      const result = classifyRMR89({
        ucs: opts.ucs,
        rqd: opts.rqd,
        spacing: opts.spacing,
        condition: opts.condition,
        groundwater: opts.gw,
        orientationAdjustment: opts.orientation,
      });

      if (flags.json) { renderJSON(result); return; }

      heading('Rock Mass Rating (RMR89 — Bieniawski 1989)');

      keyValue('UCS rating', `${result.ratings.ucs}/15`);
      keyValue('RQD rating', `${result.ratings.rqd}/20`);
      keyValue('Spacing rating', `${result.ratings.spacing}/20`);
      keyValue('Condition rating', `${result.ratings.condition}/30`);
      keyValue('Groundwater rating', `${result.ratings.groundwater}/15`);
      keyValue('Orientation adjustment', `${result.ratings.orientation}`);
      console.log('');
      keyValue('Total RMR', `${result.totalRating}/100`);
      keyValue('Rock class', `Class ${result.classNumber}: ${result.rockClass}`);
      keyValue('Support recommendation', result.supportRecommendation);

      renderSteps(result.steps, flags.verbose);

      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(result, null, 2));
        success(`Results saved to ${flags.output}`);
      }
      console.log('');
    });

  addGlobalFlags(rmrCmd);
  classify.addCommand(rmrCmd);

  // --- USCS ---
  const uscsCmd = new Command('uscs')
    .description('Unified Soil Classification System (ASTM D2487)')
    .requiredOption('--gravel <percent>', 'Gravel fraction (%)', parseFloat)
    .requiredOption('--sand <percent>', 'Sand fraction (%)', parseFloat)
    .requiredOption('--fines <percent>', 'Fines fraction (%)', parseFloat)
    .option('--ll <percent>', 'Liquid Limit (%)', parseFloat)
    .option('--pi <percent>', 'Plasticity Index (%)', parseFloat)
    .option('--d10 <mm>', 'D10 particle size (mm)', parseFloat)
    .option('--d30 <mm>', 'D30 particle size (mm)', parseFloat)
    .option('--d60 <mm>', 'D60 particle size (mm)', parseFloat)
    .action((opts) => {
      const flags = getGlobalFlags(opts);

      const result = classifyUSCS({
        gravelPercent: opts.gravel,
        sandPercent: opts.sand,
        finesPercent: opts.fines,
        liquidLimit: opts.ll,
        plasticityIndex: opts.pi,
        d10: opts.d10,
        d30: opts.d30,
        d60: opts.d60,
      });

      if (flags.json) { renderJSON(result); return; }

      heading('USCS Classification (ASTM D2487)');
      keyValue('Symbol', result.symbol);
      keyValue('Name', result.name);
      keyValue('Group', result.group);

      renderSteps(result.steps, flags.verbose);
      console.log('');
    });

  addGlobalFlags(uscsCmd);
  classify.addCommand(uscsCmd);

  // --- Q-system ---
  const qCmd = new Command('q-system')
    .description('Q-system rock classification (Barton et al. 1974)')
    .requiredOption('--rqd <percent>', 'RQD (%)', parseFloat)
    .requiredOption('--jn <number>', 'Joint set number Jn', parseFloat)
    .requiredOption('--jr <number>', 'Joint roughness number Jr', parseFloat)
    .requiredOption('--ja <number>', 'Joint alteration number Ja', parseFloat)
    .option('--jw <number>', 'Joint water reduction Jw', parseFloat, 1.0)
    .option('--srf <number>', 'Stress reduction factor SRF', parseFloat, 1.0)
    .action((opts) => {
      const flags = getGlobalFlags(opts);

      const result = classifyQSystem({
        rqd: opts.rqd,
        jn: opts.jn,
        jr: opts.jr,
        ja: opts.ja,
        jw: opts.jw,
        srf: opts.srf,
      });

      if (flags.json) { renderJSON(result); return; }

      heading('Q-System Classification (Barton 1974)');
      keyValue('Q value', result.qValue);
      keyValue('Category', result.category);
      keyValue('Support', result.supportRecommendation);

      renderSteps(result.steps, flags.verbose);
      console.log('');
    });

  addGlobalFlags(qCmd);
  classify.addCommand(qCmd);

  program.addCommand(classify);
}
