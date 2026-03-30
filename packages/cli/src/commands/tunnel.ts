import { Command } from 'commander';
import { predictTBMPerformance, selectTBMType, predictCutterWear } from '@geotechcli/core';
import { heading, keyValue, renderTable, renderSteps, renderJSON, success } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { writeFileSync } from 'node:fs';

export function registerTunnelCommands(program: Command): void {
  const tunnel = new Command('tunnel').description('Tunnel engineering commands');

  // --- TBM Predict ---
  const predict = new Command('tbm-predict')
    .description('TBM performance prediction (penetration rate, thrust, torque, cutter wear)')
    .requiredOption('--diameter <m>', 'TBM diameter (m)', parseFloat)
    .requiredOption('--ucs <MPa>', 'Rock UCS (MPa)', parseFloat)
    .requiredOption('--rqd <percent>', 'RQD (%)', parseFloat)
    .option('--cai <index>', 'Cerchar Abrasivity Index', parseFloat)
    .option('--bts <MPa>', 'Brazilian Tensile Strength (MPa)', parseFloat)
    .option('--joint-spacing <m>', 'Mean joint spacing (m)', parseFloat)
    .option('--alpha <deg>', 'Angle tunnel axis vs joints (deg)', parseFloat)
    .option('--rpm <n>', 'Cutterhead RPM', parseFloat)
    .option('--cutters <n>', 'Number of disc cutters', parseInt)
    .action((opts) => {
      const flags = getGlobalFlags(opts);
      const result = predictTBMPerformance({
        diameter: opts.diameter,
        ucs: opts.ucs,
        rqd: opts.rqd,
        cai: opts.cai,
        bts: opts.bts,
        jointSpacing: opts.jointSpacing,
        alpha: opts.alpha,
        rpm: opts.rpm,
        numberOfCutters: opts.cutters,
      });

      if (flags.json) { renderJSON(result); return; }

      heading('TBM Performance Prediction');
      keyValue('Penetration rate', `${result.penetrationRate} mm/rev`);
      keyValue('Daily advance rate', `${result.advanceRate} m/day`);
      keyValue('Field Penetration Index', `${result.fieldPenetrationIndex} kN/cutter/mm`);
      keyValue('Required thrust', `${(result.requiredThrust / 1000).toFixed(0)} MN`);
      keyValue('Required torque', `${result.requiredTorque} kNm`);
      keyValue('Cutterhead power', `${(result.cutterheadPower / 1000).toFixed(0)} MW`);
      keyValue('Specific energy', `${result.specificEnergy} MJ/m³`);
      keyValue('Cutter wear index', `${result.cutterWearIndex}`);
      keyValue('Estimated cutter life', `${result.cutterLife} m/cutter`);

      renderSteps(result.steps, flags.verbose);
      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(result, null, 2));
        success(`Results saved to ${flags.output}`);
      }
      console.log('');
    });
  addGlobalFlags(predict);
  tunnel.addCommand(predict);

  // --- TBM Select ---
  const select = new Command('tbm-select')
    .description('TBM type recommendation based on ground conditions')
    .requiredOption('--diameter <m>', 'Tunnel diameter (m)', parseFloat)
    .requiredOption('--ground <type>', 'Ground type: rock|soft_ground|mixed|squeezing|karst')
    .option('--ucs <MPa>', 'Average UCS (MPa)', parseFloat)
    .option('--water <bar>', 'Max water pressure (bar)', parseFloat, 0)
    .option('--overburden <m>', 'Max overburden (m)', parseFloat)
    .option('--fines <percent>', 'Fines content (%)', parseFloat)
    .option('--sticky-clay', 'Risk of sticky clay / clogging', false)
    .option('--boulders', 'Risk of boulders', false)
    .option('--gas', 'Risk of methane / H2S', false)
    .action((opts) => {
      const flags = getGlobalFlags(opts);
      const result = selectTBMType({
        diameter: opts.diameter,
        groundType: opts.ground,
        ucs: opts.ucs,
        waterPressure: opts.water,
        overburden: opts.overburden,
        finesContent: opts.fines,
        stickyClayRisk: opts.stickyClay,
        boulderRisk: opts.boulders,
        gasRisk: opts.gas,
      });

      if (flags.json) { renderJSON(result); return; }

      heading(`TBM Selection — ${result.recommendation}`);
      keyValue('Type', result.type);
      keyValue('Confidence', `${result.confidence}%`);

      console.log('');
      console.log('  Key factors:');
      for (const f of result.keyFactors) {
        console.log(`    • ${f}`);
      }

      if (result.alternatives.length > 0) {
        console.log('');
        console.log('  Alternatives:');
        for (const a of result.alternatives) {
          console.log(`    ○ ${a}`);
        }
      }

      if (result.operationalNotes.length > 0) {
        console.log('');
        console.log('  Operational notes:');
        for (const n of result.operationalNotes) {
          console.log(`    ⚠ ${n}`);
        }
      }

      renderSteps(result.steps, flags.verbose);
      console.log('');
    });
  addGlobalFlags(select);
  tunnel.addCommand(select);

  // --- Cutter Wear ---
  const wear = new Command('cutter-wear')
    .description('TBM cutter wear prediction and cost estimate')
    .requiredOption('--cai <index>', 'Cerchar Abrasivity Index', parseFloat)
    .requiredOption('--ucs <MPa>', 'UCS (MPa)', parseFloat)
    .requiredOption('--distance <m>', 'Total tunnel length (m)', parseFloat)
    .requiredOption('--cutters <n>', 'Number of cutters', parseInt)
    .option('--quartz <percent>', 'Quartz content (%)', parseFloat, 30)
    .action((opts) => {
      const flags = getGlobalFlags(opts);
      const result = predictCutterWear({
        cai: opts.cai,
        ucs: opts.ucs,
        quartz: opts.quartz,
        totalDistance: opts.distance,
        numberOfCutters: opts.cutters,
      });

      if (flags.json) { renderJSON(result); return; }

      heading('Cutter Wear Prediction');
      keyValue('Abrasivity class', result.abrasivityClass);
      keyValue('Cutter life', `${result.wearRatePerCutter} m/cutter`);
      keyValue('Total cutter changes', `${result.totalCutterChanges}`);
      keyValue('Estimated cutter cost', `€${result.costEstimate.toLocaleString()}`);

      renderSteps(result.steps, flags.verbose);
      console.log('');
    });
  addGlobalFlags(wear);
  tunnel.addCommand(wear);

  program.addCommand(tunnel);
}
