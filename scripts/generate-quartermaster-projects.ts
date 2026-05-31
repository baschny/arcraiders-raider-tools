#!/usr/bin/env npx tsx

/**
 * Quartermaster Project Data Generator
 *
 * Reads ../arcraiders-data/projects.json (multilang) and generates
 * locale-specific files at public/data/quartermaster/projects.<locale>.json
 * in the same {value, originalEn} format used by hideout.json.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES = [
  'en',
  'de',
  'pt-BR',
  'es',
  'fr',
  'it',
  'ja',
  'ko-KR',
  'pl',
  'ru',
  'tr',
  'zh-CN',
  'zh-TW',
] as const;
type OutputLocale = (typeof LOCALES)[number];

interface MultilangString { en: string;[key: string]: string }

interface SourceRequirementItem {
  itemId: string;
  quantity: number;
  rewardItemIds?: Array<{ itemId: string; quantity: number }>;
}

interface SourcePhase {
  name: MultilangString;
  description: MultilangString;
  phase: number;
  requirementItemIds: SourceRequirementItem[];
}

interface SourceProject {
  id: string;
  disabled: boolean;
  name: MultilangString;
  description: MultilangString;
  startDate?: number;
  endDate?: number;
  phases: SourcePhase[];
}

interface LocalizedName {
  value: string;
  originalEn: string;
}

interface OutputRequirementItem {
  itemId: string;
  quantity: number;
}

interface OutputPhase {
  name: LocalizedName;
  index: number;
  requirementItemIds: OutputRequirementItem[];
}

interface OutputProject {
  id: string;
  name: LocalizedName;
  startDate?: number;
  endDate?: number;
  phases: OutputPhase[];
}

function resolveLang(obj: MultilangString, locale: string): string {
  return obj[locale] ?? obj['en'] ?? '';
}

function cleanProjectName(name: string): string {
  return name.replace(/^(Expedition Project|Expedition) \(Expedition (\d+)\)$/i, 'Expedition $2');
}

function transformProject(project: SourceProject, locale: OutputLocale): OutputProject {
  if (project.disabled) {
    return null as unknown as OutputProject;
  }

  const enName = project.name['en'] ?? project.name['en'] ?? '';

  return {
    id: project.id,
    name: {
      value: cleanProjectName(resolveLang(project.name, locale)),
      originalEn: cleanProjectName(enName),
    },
    startDate: project.startDate,
    endDate: project.endDate,
    phases: project.phases.map((phase) => ({
      name: {
        value: resolveLang(phase.name, locale),
        originalEn: phase.name['en'] ?? '',
      },
      index: phase.phase,
      requirementItemIds: phase.requirementItemIds.map((req) => ({
        itemId: req.itemId,
        quantity: req.quantity,
      })),
    })),
  };
}

function main() {
  const scriptPath = path.resolve(process.argv[1] ?? './scripts/generate-quartermaster-projects.ts');
  const scriptDir = path.dirname(scriptPath);
  const sourceFile = path.resolve(scriptDir, '../../arcraiders-data/projects.json');

  if (!fs.existsSync(sourceFile)) {
    console.error(`Source file not found: ${sourceFile}`);
    console.error('Ensure ../arcraiders-data/projects.json exists.');
    process.exit(1);
  }

  const sourceData: SourceProject[] = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));

  const destDir = path.resolve(scriptDir, '../public/data/quartermaster');
  fs.mkdirSync(destDir, { recursive: true });

  for (const locale of LOCALES) {
    const projects = sourceData
      .filter((p) => !p.disabled)
      .map((p) => transformProject(p, locale));

    const destFile = path.join(destDir, `projects.${locale}.json`);
    fs.writeFileSync(destFile, JSON.stringify(projects, null, 2), 'utf-8');
    console.log(`Generated ${destFile} (${projects.length} projects)`);
  }

  console.log('Quartermaster project data generation complete.');
}

main();
