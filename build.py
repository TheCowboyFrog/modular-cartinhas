#!/usr/bin/env python3
"""Junta index.html + style.css + app.js + dados.js em UM arquivo HTML autocontido.

    python3 build.py            ->  dist/galeria-de-baralhos.html

O site publicado precisa ser um arquivo único (a hospedagem não serve CSS/JS à parte).
O arquivo gerado tem a mesma estrutura do site publicado:
  <head> do index.html + <style id="css"> + <template id="shell"> (corpo) +
  <script id="data"> (dados.js) + <script id="app"> (app.js).
Só precisa do Python 3, sem instalar nada.
"""
import json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
def ler(nome):
    with open(os.path.join(AQUI, nome), encoding='utf-8') as f:
        return f.read()

html = ler('index.html')
css = ler('style.css')
js = ler('app.js')
dados = ler('dados.js')

def entre(texto, a, b):
    i = texto.index(a) + len(a)
    return texto[i:texto.index(b, i)]

# <head>: tudo menos o link para style.css (o CSS vai embutido)
head = entre(html, '<head>', '</head>')
head = re.sub(r'[ \t]*<link rel="stylesheet" href="style.css">\n?', '', head).strip('\n') + '\n'

# corpo: tudo menos as duas tags <script src=...>
corpo = entre(html, '<body>', '</body>')
corpo = re.sub(r'[ \t]*<script src="(dados|app)\.js"></script>\n?', '', corpo).strip('\n')

# dados: precisa ser um JSON válido
m = re.search(r'window\.__DADOS__\s*=\s*(\{.*\})\s*;', dados, re.S)
if not m:
    sys.exit('dados.js: não encontrei "window.__DADOS__ = {...};"')
try:
    d = json.loads(m.group(1))
except ValueError as e:
    sys.exit('dados.js: JSON inválido: %s' % e)
dados_json = (json.dumps(d, ensure_ascii=False, separators=(',', ':'))
              .replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))

# app: o texto __HEAD__ vira o conteúdo do <head> (usado quando o dono publica pelo modo editor)
head_literal = json.dumps(head, ensure_ascii=False).replace('</', '<\\/')
js = js.replace('__HEAD__', head_literal)

for nome, texto in (('app.js', js), ('style.css', css)):
    for ruim in ('</script', '<!--') if nome == 'app.js' else ('</style',):
        if ruim in texto:
            sys.exit('%s não pode conter "%s" (quebraria o HTML único). Troque por uma forma equivalente, ex.: "<\\/script".' % (nome, ruim))

saida = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n' + head +
         '<style id="css">' + css + '</style>\n</head>\n<body>\n'
         '<template id="shell">' + corpo + '</template>\n'
         '<script type="application/json" id="data">' + dados_json + '</script>\n'
         '<script id="app">' + js + '</script>\n</body>\n</html>\n')

os.makedirs(os.path.join(AQUI, 'dist'), exist_ok=True)
destino = os.path.join(AQUI, 'dist', 'galeria-de-baralhos.html')
with open(destino, 'w', encoding='utf-8') as f:
    f.write(saida)
print('Gerado: %s (%.1f KB, limite de publicação 16 MB)' % (destino, len(saida.encode('utf-8')) / 1024))
