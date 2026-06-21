import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { authService } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import styles from './Sidebar.module.css';

export default function Sidebar({ rooms, activeRoom, onRoomSelect, onStartDirect, onCreateGroup, loadingRooms }) {
  const { user, logout } = useAuth();
  const { connected, onlineUsers } = useSocket();
  const [users, setUsers] = useState([]);
  const [panel, setPanel] = useState('rooms'); // 'rooms' | 'users'
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  useEffect(() => {
    authService.getUsers().then(({ data }) => setUsers(data.users)).catch(() => {});
  }, []);

  const onlineSet = new Set(onlineUsers.map((u) => u.userId));

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '?';

  const getRoomDisplayName = (room) => {
    if (room.type === 'group') return room.name || 'Grupo';
    return room._peerUsername || 'Chat Direto';
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    await onCreateGroup(groupName.trim(), selectedMembers);
    setGroupModal(false);
    setGroupName('');
    setSelectedMembers([]);
  };

  const otherUsers = users.filter((u) => u.id !== user?.id);

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>⬡</span>
          <span className={styles.brandName}>DistChat</span>
        </div>
        <div className={`${styles.connDot} ${connected ? styles.connDotOn : ''}`} title={connected ? 'Conectado' : 'Desconectado'} />
      </div>

      {/* User profile */}
      <div className={styles.profile}>
        <div className={styles.avatar} style={{ background: user?.avatar_color }}>
          {getInitials(user?.username)}
        </div>
        <div className={styles.profileInfo}>
          <span className={styles.profileName}>{user?.username}</span>
          <span className={styles.profileStatus}>● online</span>
        </div>
        <button className={styles.logoutBtn} onClick={logout} title="Sair">⎋</button>
      </div>

      {/* Panel tabs */}
      <div className={styles.panelTabs}>
        <button
          className={`${styles.panelTab} ${panel === 'rooms' ? styles.panelTabActive : ''}`}
          onClick={() => setPanel('rooms')}
        >Conversas</button>
        <button
          className={`${styles.panelTab} ${panel === 'users' ? styles.panelTabActive : ''}`}
          onClick={() => setPanel('users')}
        >Usuários</button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {panel === 'rooms' && (
          <>
            <div className={styles.sectionHeader}>
              <span>CONVERSAS</span>
              <button className={styles.newGroupBtn} onClick={() => setGroupModal(true)} title="Novo grupo">+</button>
            </div>

            {loadingRooms ? (
              <div className={styles.loading}>Carregando...</div>
            ) : rooms.length === 0 ? (
              <div className={styles.empty}>
                <p>Nenhuma conversa.</p>
                <p>Abra a aba Usuários para iniciar um chat.</p>
              </div>
            ) : (
              <ul className={styles.roomList}>
                {rooms.map((room) => (
                  <li
                    key={room.id}
                    className={`${styles.roomItem} ${activeRoom?.id === room.id ? styles.roomItemActive : ''}`}
                    onClick={() => onRoomSelect(room)}
                  >
                    <div
                      className={styles.roomAvatar}
                      style={{ background: room.type === 'group' ? '#6366f1' : (room._peerColor || '#888') }}
                    >
                      {room.type === 'group' ? '#' : getInitials(getRoomDisplayName(room))}
                    </div>
                    <div className={styles.roomInfo}>
                      <div className={styles.roomName}>{getRoomDisplayName(room)}</div>
                      {room.last_message && (
                        <div className={styles.roomPreview}>
                          {room.last_sender !== 'system' && <span>{room.last_sender}: </span>}
                          {room.last_message}
                        </div>
                      )}
                    </div>
                    {room.last_message_at && (
                      <span className={styles.roomTime}>
                        {formatDistanceToNow(new Date(room.last_message_at), { locale: ptBR, addSuffix: false })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {panel === 'users' && (
          <>
            <div className={styles.sectionHeader}><span>TODOS OS USUÁRIOS</span></div>
            <ul className={styles.userList}>
              {otherUsers.map((u) => (
                <li key={u.id} className={styles.userItem} onClick={() => onStartDirect(u)}>
                  <div className={styles.avatar} style={{ background: u.avatar_color, fontSize: '0.7rem' }}>
                    {getInitials(u.username)}
                  </div>
                  <span className={styles.userName}>{u.username}</span>
                  {onlineSet.has(u.id) && <span className={styles.onlineBadge}>●</span>}
                </li>
              ))}
              {otherUsers.length === 0 && (
                <li className={styles.empty}>Nenhum outro usuário registrado.</li>
              )}
            </ul>
          </>
        )}
      </div>

      {/* Create Group Modal */}
      {groupModal && (
        <div className={styles.modalOverlay} onClick={() => setGroupModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Novo Grupo</h3>
            <input
              className={styles.modalInput}
              placeholder="Nome do grupo"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
            />
            <p className={styles.modalLabel}>Selecionar membros:</p>
            <ul className={styles.memberList}>
              {otherUsers.map((u) => (
                <li
                  key={u.id}
                  className={`${styles.memberItem} ${selectedMembers.includes(u.id) ? styles.memberSelected : ''}`}
                  onClick={() =>
                    setSelectedMembers((prev) =>
                      prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                    )
                  }
                >
                  <div className={styles.avatar} style={{ background: u.avatar_color, width: 28, height: 28, fontSize: '0.65rem' }}>
                    {getInitials(u.username)}
                  </div>
                  {u.username}
                  {selectedMembers.includes(u.id) && <span className={styles.check}>✓</span>}
                </li>
              ))}
            </ul>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setGroupModal(false)}>Cancelar</button>
              <button
                className={styles.createBtn}
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0}
              >Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
