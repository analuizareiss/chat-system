import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import styles from './ChatWindow.module.css';

export default function ChatWindow({ room, messages, typingUsers, onSendMessage, onTyping }) {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingRef = useRef(false);

  const roomMessages = messages[room?.id] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages.length]);

  useEffect(() => {
    if (room) inputRef.current?.focus();
    setInput('');
  }, [room?.id]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!typingRef.current) {
      onTyping?.(room.id, true);
      typingRef.current = true;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      setInput('');
      onTyping?.(room.id, false);
      typingRef.current = false;
    }
  };

  const submit = () => {
    const content = input.trim();
    if (!content || !room) return;
    onSendMessage(room.id, content);
    setInput('');
    onTyping?.(room.id, false);
    typingRef.current = false;
  };

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '?';

  const getRoomDisplayName = (r) => {
    if (!r) return '';
    if (r.type === 'group') return r.name || 'Grupo';
    return r._peerUsername || 'Chat Direto';
  };

  const typing = room ? (typingUsers[room.id] || {}) : {};
  const typingNames = Object.values(typing);

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  for (const msg of roomMessages) {
    const date = msg.created_at?.split('T')[0] || msg.created_at?.split(' ')[0];
    if (date !== lastDate) {
      grouped.push({ type: 'date', date });
      lastDate = date;
    }
    grouped.push({ type: 'message', msg });
  }

  if (!room) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>⬡</div>
        <h2 className={styles.emptyTitle}>DistChat</h2>
        <p className={styles.emptyText}>Selecione uma conversa ou inicie um novo chat.</p>
      </div>
    );
  }

  return (
    <div className={styles.window}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div
          className={styles.roomAvatar}
          style={{ background: room.type === 'group' ? '#6366f1' : (room._peerColor || '#888') }}
        >
          {room.type === 'group' ? '#' : getInitials(getRoomDisplayName(room))}
        </div>
        <div className={styles.roomMeta}>
          <span className={styles.roomName}>{getRoomDisplayName(room)}</span>
          <span className={styles.roomType}>{room.type === 'group' ? 'Grupo' : 'Conversa direta'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {grouped.map((item, i) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${i}`} className={styles.dateDivider}>
                <span>{item.date}</span>
              </div>
            );
          }
          const { msg } = item;
          const isOwn = msg.sender_id === user?.id;
          const isSystem = msg.type === 'system';

          if (isSystem) {
            return (
              <div key={msg.id} className={styles.systemMsg}>
                {msg.content}
              </div>
            );
          }

          return (
            <div key={msg.id} className={`${styles.msgRow} ${isOwn ? styles.msgRowOwn : ''}`}>
              {!isOwn && (
                <div className={styles.msgAvatar} style={{ background: '#6366f1' }}>
                  {getInitials(msg.sender_username)}
                </div>
              )}
              <div className={styles.msgBubbleGroup}>
                {!isOwn && <span className={styles.msgSender}>{msg.sender_username}</span>}
                <div className={`${styles.msgBubble} ${isOwn ? styles.msgBubbleOwn : ''}`}>
                  <span className={styles.msgContent}>{msg.content}</span>
                  <span className={styles.msgTime}>
                    {msg.created_at
                      ? format(new Date(msg.created_at), 'HH:mm', { locale: ptBR })
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {typingNames.length > 0 && (
          <div className={styles.typingIndicator}>
            <span className={styles.typingDots}>
              <span /><span /><span />
            </span>
            <span>{typingNames.join(', ')} {typingNames.length === 1 ? 'está' : 'estão'} digitando...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={`Mensagem para ${getRoomDisplayName(room)}...`}
          rows={1}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={submit}
          disabled={!input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
