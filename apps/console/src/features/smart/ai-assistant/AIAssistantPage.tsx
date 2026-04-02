import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { currentMessages, conversations, suggestedQueries, type Message } from './mock-data';

export function AIAssistantPage() {
  const { t } = useTranslation('smart');
  const [messages, setMessages] = useState<Message[]>(currentMessages);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg: Message = { id: `M${Date.now()}`, role: 'user', content: input, timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    // Simulate assistant response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: `M${Date.now() + 1}`, role: 'assistant',
        content: 'Tôi đang xử lý yêu cầu của bạn. Vui lòng chờ trong giây lát...',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }, 500);
  };

  return (
    <div>
      <PageHeader title={t('aiAssistant.title')} description={t('aiAssistant.description')} />

      <div className="grid grid-cols-4 gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Sidebar */}
        <div className="col-span-1 bg-card border border-border rounded-lg p-4 flex flex-col">
          <Button className="w-full bg-smart hover:bg-smart/90 text-background mb-4">+ {t('aiAssistant.newConversation')}</Button>
          <h3 className="text-[12px] font-medium text-muted-foreground mb-2 uppercase">{t('aiAssistant.recent')}</h3>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {conversations.map((c, i) => (
              <div key={c.id} className={cn(
                'p-2.5 rounded-md cursor-pointer transition-colors',
                i === 0 ? 'bg-smart/10 border border-smart/30' : 'hover:bg-muted'
              )}>
                <div className="text-[13px] font-medium text-foreground truncate">{c.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{c.lastMessage}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{c.date} · {c.messageCount} tin nhắn</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="col-span-3 flex flex-col bg-card border border-border rounded-lg">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(m => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[70%] rounded-lg p-3',
                  m.role === 'user' ? 'bg-smart/20 border border-smart/30' : 'bg-background border border-border'
                )}>
                  <div className="text-[13px] text-foreground whitespace-pre-wrap">{m.content}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 text-right">{m.timestamp}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Suggested queries */}
          <div className="px-4 py-2 border-t border-border">
            <div className="flex gap-2 flex-wrap">
              {suggestedQueries.slice(0, 3).map(q => (
                <button type="button" key={q} onClick={() => setInput(q)} className="px-2.5 py-1 bg-background border border-border rounded-md text-[11px] text-muted-foreground hover:border-smart/50 hover:text-smart transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={t('aiAssistant.inputPlaceholder')}
                className="flex-1 h-10"
              />
              <Button onClick={handleSend} className="h-10 bg-smart hover:bg-smart/90 text-background">{t('aiAssistant.chat.send')}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
