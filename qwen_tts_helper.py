import os
import sys
import dashscope

def synthesize_qwen_tts(text: str, voice_id: str, output_path: str):
    """
    使用 Dashscope MultiModalConversation 接口调用已复刻好的音色（Voice ID）生成语音并保存
    """
    model = "qwen3-tts-vc-2026-01-22"
    
    dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'
    
    # 强制从环境变量获取 API Key，移除泄露风险高的硬编码 Key
    dashscope.api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not dashscope.api_key:
        print("FAILED: 服务端未配置 DASHSCOPE_API_KEY 环境变量")
        sys.exit(1)

    try:
        response = dashscope.MultiModalConversation.call(
            model=model,
            text=text,
            voice=voice_id,
            stream=False
        )
        
        if response.status_code == 200:
            try:
                # 根据真实返回解析 json
                output = getattr(response, 'output', {})
                if isinstance(output, dict) and 'audio' in output:
                    audio_url = output['audio'].get('url')
                    if audio_url:
                        import requests
                        r = requests.get(audio_url)
                        with open(output_path, 'wb') as f:
                            f.write(r.content)
                        print("SUCCESS")
                        return

                # 兜底：从 choices 中提取（旧版或其它模型格式）
                if isinstance(output, dict) and 'choices' in output and output['choices']:
                    message_content = output['choices'][0].get('message', {}).get('content', [])
                    for item in message_content:
                        if isinstance(item, dict) and 'audio' in item:
                            audio_data_or_url = item['audio']
                            if str(audio_data_or_url).startswith('http'):
                                import requests
                                r = requests.get(audio_data_or_url)
                                with open(output_path, 'wb') as f:
                                    f.write(r.content)
                                print("SUCCESS")
                                return
            except Exception as inner_e:
                print(f"FAILED: 解析音频失败: {inner_e}")
                sys.exit(1)
        else:
            print(f"FAILED: 状态码非200: {response}")
            sys.exit(1)
                            
        print(f"FAILED: 响应中未找到可提取的音频数据.")
        sys.exit(1)
            
    except Exception as e:
         print(f"FAILED: 阿里云 TTS 调用出错: {str(e)}")
         sys.exit(1)

if __name__ == '__main__':
    # 接收 Node 传递参数：[1] 文本 [2] 目标文件路径 [3] Voice ID
    if len(sys.argv) < 4:
        print("FAILED: 参数不足。用法: python qwen_tts_helper.py <text> <output_path> <voice_id>")
        sys.exit(1)

    text_to_speak = sys.argv[1]
    save_path = sys.argv[2]
    voice_clone_id = sys.argv[3]
    
    synthesize_qwen_tts(text_to_speak, voice_clone_id, save_path)
