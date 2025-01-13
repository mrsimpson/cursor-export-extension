import * as fs from 'fs';
import * as path from 'path';
import { ExportOptions } from '../types';
import { log } from '../utils';

export async function saveExportFile(
    content: string,
    options: ExportOptions
): Promise<string> {
    try {
        const outputPath = path.join(
            options.outputPath || '',
            `cursor-export-${Date.now()}.md`
            // `cursor-export-${Date.now()}.${options.format || 'md'}`
        );

        await fs.promises.writeFile(outputPath, content, 'utf8');
        return outputPath;
    } catch (err) {
        log(`Failed to save export file: ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
    }
} 