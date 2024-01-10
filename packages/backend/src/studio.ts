/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import type { ExtensionContext, WebviewOptions, WebviewPanel } from '@podman-desktop/api';
import { Uri, window } from '@podman-desktop/api';
import { RpcExtension } from '@shared/MessageProxy';
import { StudioApiImpl } from './studio-api-impl';
import { ApplicationManager } from './managers/applicationManager';
import { GitManager } from './managers/gitManager';
import { RecipeStatusRegistry } from './registries/RecipeStatusRegistry';

import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import type { LocalModelInfo } from '@shared/models/ILocalModelInfo';

export class Studio {
  readonly #extensionContext: ExtensionContext;

  #panel: WebviewPanel | undefined;

  rpcExtension: RpcExtension;
  studioApi: StudioApiImpl;

  constructor(readonly extensionContext: ExtensionContext) {
    this.#extensionContext = extensionContext;
  }

  public async activate(): Promise<void> {
    console.log('starting studio extension');

    const extensionUri = this.#extensionContext.extensionUri;

    // register webview
    this.#panel = window.createWebviewPanel('studio', 'Studio extension', this.getWebviewOptions(extensionUri));
    this.#extensionContext.subscriptions.push(this.#panel);

    // update html

    const indexHtmlUri = Uri.joinPath(extensionUri, 'media', 'index.html');
    const indexHtmlPath = indexHtmlUri.fsPath;

    let indexHtml = await fs.promises.readFile(indexHtmlPath, 'utf8');

    // replace links with webView Uri links
    // in the content <script type="module" crossorigin src="./index-RKnfBG18.js"></script> replace src with webview.asWebviewUri
    const scriptLink = indexHtml.match(/<script.*?src="(.*?)".*?>/g);
    if (scriptLink) {
      scriptLink.forEach(link => {
        const src = link.match(/src="(.*?)"/);
        if (src) {
          const webviewSrc = this.#panel?.webview.asWebviewUri(Uri.joinPath(extensionUri, 'media', src[1]));
          indexHtml = indexHtml.replace(src[1], webviewSrc.toString());
        }
      });
    }

    // and now replace for css file as well
    const cssLink = indexHtml.match(/<link.*?href="(.*?)".*?>/g);
    if (cssLink) {
      cssLink.forEach(link => {
        const href = link.match(/href="(.*?)"/);
        if (href) {
          const webviewHref = this.#panel?.webview.asWebviewUri(Uri.joinPath(extensionUri, 'media', href[1]));
          indexHtml = indexHtml.replace(href[1], webviewHref.toString());
        }
      });
    }

    console.log('updated indexHtml to', indexHtml);

    this.#panel.webview.html = indexHtml;

    // Let's create the api that the front will be able to call
    this.rpcExtension = new RpcExtension(this.#panel.webview);
    const gitManager = new GitManager();
    const recipeStatusRegistry = new RecipeStatusRegistry();
    const applicationManager = new ApplicationManager(
      gitManager,
      recipeStatusRegistry
    )
    this.studioApi = new StudioApiImpl(
      applicationManager,
      recipeStatusRegistry,
      this
    );
    // Register the instance
    this.rpcExtension.registerInstance<StudioApiImpl>(StudioApiImpl, this.studioApi);
  }

  public async deactivate(): Promise<void> {
    console.log('stopping studio extension');
  }

  getWebviewOptions(extensionUri: Uri): WebviewOptions {
    return {
      // Enable javascript in the webview
      // enableScripts: true,

      // And restrict the webview to only loading content from our extension's `media` directory.
      localResourceRoots: [Uri.joinPath(extensionUri, 'media')],
    };
  }


  downloadModel(modelId: string, url: string) {
    const destDir = path.resolve(this.#extensionContext.storagePath, 'models', modelId);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const destFile = path.resolve(destDir, path.basename(url));
    const file = fs.createWriteStream(destFile);
    https.get(url, (resp) => {
      resp.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('model saved');
      });
    });
  }

  getLocalModels(): LocalModelInfo[] {
    const result: LocalModelInfo[] = [];
    const modelsDir = path.resolve(this.#extensionContext.storagePath, 'models');
    const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
    const dirs = entries.filter(dir => dir.isDirectory());
    for (const d of dirs) {
      const modelEntries = fs.readdirSync(path.resolve(d.path, d.name));
      if (modelEntries.length != 1) {
        // we support models with one file only for now
        continue;
      }
      result.push({
        id: d.name,
        file: modelEntries[0],
      })
    }
    return result;
  }
}
