"""DSH JSON-lines bridge. Credentials arrive on stdin, never command-line arguments."""
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'vendor'))


def emit(kind, value, secret=''):
    text = json.dumps({'type': kind, 'value': value}, ensure_ascii=False)
    if secret:
        text = text.replace(json.dumps(secret, ensure_ascii=False)[1:-1], '[已隐藏]')
    print(text, flush=True)


async def run(data):
    from model_check.runner import L1DetectionRequest, run_l1_detection
    from model_check.security import normalize_public_base_url, validate_public_target
    from model_check.config import Settings
    # Preserve upstream public-target validation and guarded HTTP transport.
    target = await validate_public_target(normalize_public_base_url(data['base_url']))
    key = data['api_key']
    result = await run_l1_detection(
        L1DetectionRequest(target, key, data['model']),
        progress=lambda _, value: emit('progress', value, key),
        settings=Settings(CONCURRENCY=1, RETRIES=0, PARAM_MATRIX_REPEAT=1),
        detection_id='dsh-model-check',
    )
    result['scope'] = 'protocol_compatibility_only'
    result['note'] = '接口兼容性检查结果不代表模型身份认证。'
    return result


if __name__ == '__main__':
    logging.disable(logging.CRITICAL)
    data = {}
    try:
        data = json.loads(sys.stdin.read(65536))
        emit('result', asyncio.run(run(data)), data.get('api_key', ''))
    except Exception as exc:
        message = str(exc).replace(data.get('api_key') or '\0', '[已隐藏]')
        message = re.sub(r'https?://[^\s<>"\']+', '[接口地址]', message)[:500]
        emit('result', {'status': 'incomplete', 'overall': None, 'error': {'code': type(exc).__name__, 'message': message}}, data.get('api_key', ''))
