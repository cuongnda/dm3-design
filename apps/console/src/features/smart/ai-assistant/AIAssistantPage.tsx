import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { currentMessages, conversations, suggestedQueries, type Message } from './mock-data';

export function AIAssistantPage() {
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
      <PageHeader title="Trợ lý AI" description="Hỏi đáp thông minh về tòa nhà" />

      <div className="grid grid-cols-4 gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Sidebar */}
        <div className="col-span-1 bg-[#1E293B] border border-[#334155] rounded-lg p-4 flex flex-col">
          <button className="w-full px-3 py-2 bg-[#06B6D4] text-[#0F172A] rounded-md text-[12px] font-medium mb-4">+ Cuộc hội thoại mới</button>
          <h3 className="text-[12px] font-medium text-[#64748B] mb-2 uppercase">Gần đây</h3>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {conversations.map((c, i) => (
              <div key={c.id} className={cn(
                'p-2.5 rounded-md cursor-pointer transition-colors',
                i === 0 ? 'bg-[#06B6D4]/10 border border-[#06B6D4]/30' : 'hover:bg-[#111827]'
              )}>
                <div className="text-[13px] font-medium text-[#F8FAFC] truncate">{c.title}</div>
                <div className="text-[11px] text-[#64748B] truncate">{c.lastMessage}</div>
                <div className="text-[10px] text-[#475569] mt-1">{c.date} · {c.messageCount} tin nhắn</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="col-span-3 flex flex-col bg-[#1E293B] border border-[#334155] rounded-lg">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(m => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[70%] rounded-lg p-3',
                  m.role === 'user' ? 'bg-[#06B6D4]/20 border border-[#06B6D4]/30' : 'bg-[#111827] border border-[#334155]'
                )}>
                  <div className="text-[13px] text-[#F8FAFC] whitespace-pre-wrap">{m.content}</div>
                  <div className="text-[10px] text-[#64748B] mt-1 text-right">{m.timestamp}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Suggested queries */}
          <div className="px-4 py-2 border-t border-[#334155]">
            <div className="flex gap-2 flex-wrap">
              {suggestedQueries.slice(0, 3).map(q => (
                <button key={q} onClick={() => setInput(q)} className="px-2.5 py-1 bg-[#111827] border border-[#334155] rounded-md text-[11px] text-[#94A3B8] hover:border-[#06B6D4]/50 hover:text-[#06B6D4] transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[#334155]">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Nhập câu hỏi..."
                className="flex-1 h-10 px-4 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#475569] focus:outline-none focus:border-[#06B6D4]/50"
              />
              <button onClick={handleSend} className="px-4 h-10 bg-[#06B6D4] text-[#0F172A] rounded-md text-[13px] font-medium">Gửi</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
