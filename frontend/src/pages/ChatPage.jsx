import React, { useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const {
    rooms, activeRoom, messages, typingUsers, loadingRooms,
    loadRooms, openRoom, startDirectChat, createGroup,
    sendMessage, startTyping, stopTyping,
  } = useChat();

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleTyping = (roomId, isTyping) => {
    if (isTyping) startTyping(roomId);
    else stopTyping(roomId);
  };

  return (
    <div className={styles.layout}>
      <Sidebar
        rooms={rooms}
        activeRoom={activeRoom}
        loadingRooms={loadingRooms}
        onRoomSelect={openRoom}
        onStartDirect={startDirectChat}
        onCreateGroup={createGroup}
      />
      <ChatWindow
        room={activeRoom}
        messages={messages}
        typingUsers={typingUsers}
        onSendMessage={sendMessage}
        onTyping={handleTyping}
      />
    </div>
  );
}
