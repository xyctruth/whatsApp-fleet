import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  LogOut, 
  Send, 
  Users, 
  MessageSquare,
  QrCode,
  Phone,
  RefreshCw,
  Eye,
  Code,
  AlertCircle,
  CheckCircle,
  Clock,
  Globe,
  Terminal,
  Activity,
  Shield,
  Plus
} from 'lucide-react';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import { workerService, masterService } from '../services/api';
import { useI18n } from '../i18n/index.js';

const WhatsAppControl = ({ selectedWorker, onWorkerSelect, onRefresh }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('login'); // login, proxy, messages, contacts, debug
  const [loginStatus, setLoginStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  
  // 代理管理状态
  const [proxyStatus, setProxyStatus] = useState(null);
  const [proxyForm, setProxyForm] = useState({
    host: '',
    port: '',
    username: '',
    password: '',
    protocol: 'socks5',
    quickInput: '' // 新增快捷输入字段
  });

  // 处理快捷输入变化
  const handleQuickInputChange = (e) => {
    const value = e.target.value;
    setProxyForm(prev => ({ ...prev, quickInput: value }));
    
    // 尝试解析: host,port,user,pass
    if (value) {
      const parts = value.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        setProxyForm(prev => ({
          ...prev,
          quickInput: value,
          host: parts[0] || '',
          port: parts[1] || '',
          username: parts[2] || '',
          password: parts[3] || ''
        }));
      }
    }
  };

  // 登录表单状态
  const [loginForm, setLoginForm] = useState({
    signin_type: 40, // 30=二维码, 40=手机号
    login_phone: '',
    is_cache_login: true,
    hardware_info: {
      os: 'MacOS',
      browser: 'Chrome'
    },
    socks5: {
      ip: '',
      port: '',
      user: '',
      pwd: '',
      region: '',
      resource_code: '',
      resource_name: ''
    },
    enableProxy: false,
    quickInput: '' // 新增快捷输入字段
  });
  
  // 处理登录表单的快捷输入变化
  const handleLoginQuickInputChange = (e) => {
    const value = e.target.value;
    setLoginForm(prev => ({ ...prev, quickInput: value }));
    
    // 尝试解析: host,port,user,pass
    if (value) {
      const parts = value.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        setLoginForm(prev => ({
          ...prev,
          quickInput: value,
          socks5: {
            ...prev.socks5,
            ip: parts[0] || '',
            port: parts[1] || '',
            user: parts[2] || '',
            pwd: parts[3] || ''
          }
        }));
      }
    }
  };
  
  // 发送消息表单状态
  const [messageForm, setMessageForm] = useState({
    contact: '',
    message: ''
  });

  const [groupForm, setGroupForm] = useState({
    name: '',
    participants: '', // Comma separated IDs
    targetGroupId: ''
  });

  // 添加联系人表单状态
  const [addContactForm, setAddContactForm] = useState({
    phone: '',
    firstName: '',
    lastName: ''
  });

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!selectedWorker || !addContactForm.phone) {
      toast.error(t('whatsapp.toast.enterPhone'));
      return;
    }

    try {
      setLoading(true);
      // 传递完整的联系人信息：phone, firstName, lastName
      const response = await workerService.addContact(
          selectedWorker.id, 
          addContactForm.phone,
          addContactForm.firstName,
          addContactForm.lastName
      );
      
      if (response.data.success) {
        toast.success(t('whatsapp.toast.contactAdded'));
        setAddContactForm({ phone: '', firstName: '', lastName: '' });
        loadContacts(); // 刷新列表
      } else {
        toast.error(response.data.message || t('whatsapp.toast.contactAddFailed'));
      }
    } catch (error) {
      console.error('添加联系人失败:', error);
      toast.error(t('whatsapp.toast.contactAddRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleStopWorker = async () => {
    if (!selectedWorker) return;
    if (!confirm(t('whatsapp.confirm.stopService'))) return;

    try {
      setLoading(true);
      const response = await workerService.stop(selectedWorker.id);
      if (response.data.success) {
        toast.success(t('whatsapp.toast.serviceStopped'));
        checkLoginStatus(); // 刷新状态
      }
    } catch (error) {
      console.error('停止服务失败:', error);
      toast.error(t('whatsapp.toast.serviceStartFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorker = async () => {
    if (!selectedWorker) return;
    
    // 如果是停止状态，尝试重新登录（复用已有配置）
    try {
        setLoading(true);
        // 使用 phoneLogin 接口，仅传递 phone，后端会尝试复用
        const response = await masterService.phoneLogin({
            login_phone: selectedWorker.phone,
            signin_type: 40, // 默认手机登录
            is_cache_login: true // 尝试缓存登录
        });
        
        if (response.data.success) {
            toast.success(t('whatsapp.toast.serviceStartSent'));
            // 开始轮询状态
            pollLoginStatus(selectedWorker.id);
        } else {
            toast.error(response.data.message || t('whatsapp.toast.serviceStartFailed'));
        }
    } catch (error) {
        console.error('启动服务失败:', error);
        toast.error(t('whatsapp.toast.serviceStartRequestFailed'));
    } finally {
        setLoading(false);
    }
  };

  const handleRestartUpdate = async () => {
    if (!selectedWorker) return;
    try {
      setLoading(true);
      const response = await workerService.restart(selectedWorker.id);
      if (response.data.success) {
        toast.success(t('whatsapp.toast.restartTriggered'));
        checkLoginStatus();
      } else {
        toast.error(response.data.message || t('whatsapp.toast.restartFailed'));
      }
    } catch {
      toast.error(t('whatsapp.toast.restartRequestFailed'));
    } finally {
      setLoading(false);
    }
  };
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!selectedWorker || !groupForm.name || !groupForm.participants) {
      toast.error(t('whatsapp.toast.groupNameMembersRequired'));
      return;
    }
    
    try {
      setLoading(true);
      const participantList = groupForm.participants.split(/[,，]/).map(p => p.trim()).filter(p => p);
      if (participantList.length === 0) {
        toast.error(t('whatsapp.toast.atLeastOneMember'));
        return;
      }
      
      // Add @c.us suffix if missing (simple heuristic)
      const formattedParticipants = participantList.map(p => {
          if (!p.includes('@')) return `${p}@c.us`;
          return p;
      });

      const response = await workerService.createGroup(selectedWorker.id, {
        name: groupForm.name,
        participants: formattedParticipants
      });
      
      if (response.data.success) {
        toast.success(`${t('whatsapp.toast.groupCreated')}: ${response.data.data?.gid?._serialized || 'OK'}`);
        setGroupForm({ ...groupForm, name: '', participants: '' });
      } else {
        toast.error(t('whatsapp.toast.groupCreateFailed'));
      }
    } catch (error) {
      console.error('创建群组失败:', error);
      toast.error(t('whatsapp.toast.groupCreateRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddParticipants = async (e) => {
    e.preventDefault();
    if (!selectedWorker || !groupForm.targetGroupId || !groupForm.participants) {
      toast.error(t('whatsapp.toast.groupIdMembersRequired'));
      return;
    }
    
    try {
      setLoading(true);
      const participantList = groupForm.participants.split(/[,，]/).map(p => p.trim()).filter(p => p);
      
      // Add @c.us suffix if missing
      const formattedParticipants = participantList.map(p => {
          if (!p.includes('@')) return `${p}@c.us`;
          return p;
      });

      const response = await workerService.addGroupParticipants(selectedWorker.id, {
        groupId: groupForm.targetGroupId,
        participants: formattedParticipants
      });
      
      if (response.data.success) {
        toast.success(t('whatsapp.toast.membersAdded'));
        setGroupForm({ ...groupForm, participants: '' });
      } else {
        toast.error(t('whatsapp.toast.addMembersFailed'));
      }
    } catch (error) {
      console.error('添加成员失败:', error);
      toast.error(t('whatsapp.toast.addMembersRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorker) {
      checkLoginStatus();
      if (activeTab === 'proxy') checkProxyStatus();
      if (activeTab === 'contacts') loadContacts();
      if (activeTab === 'messages') loadMessages();
    }
  }, [selectedWorker, activeTab]);

  const checkLoginStatus = async () => {
    if (!selectedWorker) return;
    
    try {
      // 不显示全屏loading，只在局部刷新
      const response = await workerService.getLoginStatus(selectedWorker.id);
      setLoginStatus(response.data);
      
      // 检查是否有配对码
      const pCode = response.data.pairing_code || response.data.data?.pairing_code || response.data.pairingCode || response.data.data?.pairingCode;
      if (pCode) {
        setPairingCode(pCode);
      }

      if (response.data.success && (response.data.status === 'logged_in' || response.data.data?.status === 'logged_in')) {
        if (activeTab === 'contacts' && contacts.length === 0) loadContacts();
        if (activeTab === 'messages' && messages.length === 0) loadMessages();
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
    }
  };

  const checkProxyStatus = async () => {
    if (!selectedWorker) return;
    try {
      const response = await workerService.getProxyStatus(selectedWorker.id);
      // 后端可能直接返回数据，也可能包裹在 data 字段中
      // 如果 response.data.config 存在，说明是直接返回
      // 如果 response.data.data 存在，说明包裹了一层
      const proxyData = response.data.data || response.data;
      
      if (proxyData && (proxyData.success || proxyData.enabled !== undefined)) {
        setProxyStatus(proxyData);
      }
    } catch (error) {
      console.error('检查代理状态失败:', error);
    }
  };

  const handleSwitchProxy = async (e) => {
    e.preventDefault();
    if (!selectedWorker) return;
    
    try {
      setLoading(true);
      const response = await workerService.switchProxy(selectedWorker.id, {
        host: proxyForm.host,
        port: parseInt(proxyForm.port),
        username: proxyForm.username,
        password: proxyForm.password,
        protocol: proxyForm.protocol
      });
      
      if (response.data.success) {
        toast.success(t('whatsapp.toast.proxySwitchSuccess'));
        checkProxyStatus();
      } else {
        toast.error(t('whatsapp.toast.proxySwitchFailed'));
      }
    } catch (error) {
      console.error('代理切换请求失败:', error);
      toast.error(t('whatsapp.toast.proxySwitchRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDetectProxy = async () => {
    if (!selectedWorker) return;
    try {
      setLoading(true);
      const response = await workerService.detectProxy(selectedWorker.id);
      if (response.data.success) {
        const payload = response.data.data ?? response.data;
        let message = t('whatsapp.toast.proxyDetectSuccess');
        if (payload) {
          if (typeof payload === 'string') {
            message += `: ${payload}`;
          } else {
            const parts = [];
            if (payload.detected !== undefined) {
              parts.push(payload.detected ? t('whatsapp.proxy.enabled') : t('whatsapp.proxy.disabled'));
            }
            if (payload.ip) {
              parts.push(payload.ip);
            }
            const extra = parts.length > 0 ? parts.join(' | ') : JSON.stringify(payload);
            message += `: ${extra}`;
          }
        }
        toast.success(message);
      } else {
        toast.error(t('whatsapp.toast.proxyDetectFailed'));
      }
    } catch (error) {
      console.error('代理检测请求失败:', error);
      toast.error(t('whatsapp.toast.proxyDetectRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGetDebugElements = async () => {
    if (!selectedWorker) return;
    try {
      const response = await workerService.getDebugElements(selectedWorker.id);
      if (response.data.success) {
        toast.success(t('whatsapp.toast.elementDetectSuccess'));
        // 可以弹窗显示结果，或者在界面上显示
        const elements = response.data.data;
        const win = window.open('', '_blank');
        win.document.write('<pre>' + JSON.stringify(elements, null, 2) + '</pre>');
      } else {
        toast.error(t('whatsapp.toast.elementDetectFailed'));
      }
    } catch (error) {
      console.error('元素检测请求失败:', error);
      toast.error(t('whatsapp.toast.elementDetectRequestFailed'));
    }
  };

  const handleGetDebugHtml = async () => {
    if (!selectedWorker) return;
    try {
      const response = await workerService.getDebugHtml(selectedWorker.id);
      // 创建一个新窗口显示HTML
      const win = window.open('', '_blank');
      win.document.write(response.data);
    } catch (error) {
      console.error('获取调试HTML失败:', error);
      toast.error(t('whatsapp.toast.debugHtmlFailed'));
    }
  };

  const handleLogin = async () => {
    // 验证手机号
    if (!loginForm.login_phone) {
      toast.error(t('whatsapp.toast.enterPhone'));
      return;
    }

    try {
      setLoading(true);
      setQrCode(null);
      setPairingCode(null);
      
      // 使用Master服务的手机号登录API
      const loginData = {
        login_phone: loginForm.login_phone,
        signin_type: loginForm.signin_type,
        hardware_info: loginForm.hardware_info,
        is_cache_login: loginForm.is_cache_login,
        ...(loginForm.enableProxy && { 
          socks5: {
            ip: loginForm.socks5.ip,
            port: parseInt(loginForm.socks5.port) || 1080,
            username: loginForm.socks5.user,
            password: loginForm.socks5.pwd,
            region: loginForm.socks5.region,
            resource_code: loginForm.socks5.resource_code,
            resource_name: loginForm.socks5.resource_name
          }
        })
      };

      const response = await masterService.phoneLogin(loginData);
      
      if (response.data.success) {
        toast.success(t('whatsapp.toast.loginFlowStarted'));
        
        // 更新选中的Worker
        const account = response.data.data.account;
        if (account && onWorkerSelect) {
          onWorkerSelect({
            id: account.id,
            name: account.name || account.phone,
            phone: account.phone,
            status: account.status,
            port: account.port,
            service_url: account.service_url
          });
        }
        
        // 检查登录结果
        const loginResult = response.data.data.login_result;
        if (loginResult) {
          // 如果是二维码登录，获取二维码
          if (loginForm.signin_type === 30 && loginResult.data?.qr_code) {
            setQrCode(loginResult.data.qr_code);
          } else if (loginForm.signin_type === 30 && loginResult.qr_code) {
             setQrCode(loginResult.qr_code);
          }
          
          // 如果是手机号登录，显示配对码
          if (loginForm.signin_type === 40 && loginResult.data?.pairing_code) {
            setPairingCode(loginResult.data.pairing_code);
          } else if (loginForm.signin_type === 40 && loginResult.pairingCode) {
             setPairingCode(loginResult.pairingCode);
          }
        }
        
        // 开始轮询登录状态
        pollLoginStatus(account.id);
        
        // 刷新全局Worker列表
        if (onRefresh) onRefresh();
      } else {
        toast.error(response.data.message || t('whatsapp.toast.loginFailed'));
      }
    } catch (error) {
      console.error('登录失败:', error);
      toast.error(`${t('whatsapp.toast.loginRequestFailedPrefix')} ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const pollLoginStatus = (accountId) => {
    const targetId = accountId || selectedWorker?.id;
    if (!targetId) return;

    const interval = setInterval(async () => {
      try {
        const response = await workerService.getLoginStatus(targetId);
        setLoginStatus(response.data);
        
        // 检查是否有配对码
        const pCode = response.data.pairing_code || response.data.data?.pairing_code || response.data.pairingCode || response.data.data?.pairingCode;
        if (pCode) {
          setPairingCode(pCode);
        }

        if (response.data.success && (response.data.status === 'logged_in' || response.data.data?.status === 'logged_in')) {
          clearInterval(interval);
          setQrCode(null);
          setPairingCode(null);
          toast.success(t('whatsapp.toast.loginSuccess'));
          loadContacts(targetId);
          loadMessages(targetId);
          // 强制刷新页面状态，确保登录框消失
          setLoginStatus(response.data); 
        }
      } catch (error) {
        console.error('轮询登录状态失败:', error);
        clearInterval(interval);
      }
    }, 3000);

    // 60秒后停止轮询
    setTimeout(() => clearInterval(interval), 60000);
  };

  const handleLogout = async () => {
    if (!selectedWorker) return;

    try {
      setLoading(true);
      const response = await workerService.logout(selectedWorker.id);
      
      if (response.data.success) {
        toast.success(t('whatsapp.toast.logoutSuccess'));
        setLoginStatus(null);
        setContacts([]);
        setMessages([]);
        setQrCode(null);
        setPairingCode(null);
      } else {
        toast.error(response.data.message || t('whatsapp.toast.logoutFailed'));
      }
    } catch (error) {
      console.error('退出登录失败:', error);
      toast.error(t('whatsapp.toast.logoutFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseWorker = async () => {
    if (!selectedWorker) return;
    if (!confirm(t('whatsapp.confirm.closeWorker'))) return;

    try {
      setLoading(true);
      const response = await workerService.close(selectedWorker.id);
      if (response.data.success) {
        toast.success(t('whatsapp.toast.workerClosed'));
        setLoginStatus(null);
      }
    } catch (error) {
      console.error('关闭Worker失败:', error);
      toast.error(t('whatsapp.toast.closeWorkerFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async (accountId) => {
    const targetId = accountId || selectedWorker?.id;
    if (!targetId) return;

    try {
      setLoading(true);
      const response = await workerService.getContacts(targetId);
      if (response.data.success) {
        // 后端返回的数据结构可能包含 count 字段，所以需要取 contacts 字段
        const contactsData = response.data.data?.contacts || response.data.data || [];
        setContacts(Array.isArray(contactsData) ? contactsData : []);
      }
    } catch (error) {
      console.error('加载联系人失败:', error);
      toast.error(t('whatsapp.toast.loadContactsFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (accountId) => {
    const targetId = accountId || selectedWorker?.id;
    if (!targetId) return;

    try {
      setLoading(true);
      const response = await workerService.getMessages(targetId);
      if (response.data.success) {
        // 同理处理消息列表
        const messagesData = response.data.data?.messages || response.data.data || [];
        setMessages(Array.isArray(messagesData) ? messagesData : []);
      }
    } catch (error) {
      console.error('加载消息失败:', error);
      toast.error(t('whatsapp.toast.loadMessagesFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedWorker || !messageForm.contact || !messageForm.message) {
      toast.error(t('whatsapp.toast.fillAllFields'));
      return;
    }

    try {
      setLoading(true);
      const response = await workerService.sendMessage({
        account_id: selectedWorker.id,
        contact: messageForm.contact,
        message: messageForm.message
      });
      
      if (response.data.success) {
        toast.success(t('whatsapp.toast.messageSendSuccess'));
        setMessageForm({ contact: '', message: '' });
        loadMessages(); // 刷新消息列表
      } else {
        toast.error(response.data.message || t('whatsapp.toast.messageSendFailed'));
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      toast.error(t('whatsapp.toast.messageSendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const getLoginStatusDisplay = () => {
    // 基础检查：如果 selectedWorker 的状态是 stopped，直接返回停止状态
    // 注意：这里我们优先使用 selectedWorker 的状态，因为它来自 WorkerManager 的列表，反映了 Master 的视角
    // 但如果有实时的 loginStatus，则使用实时的
    
    let status = 'unknown';
    
    if (loginStatus?.success) {
       status = loginStatus.status || loginStatus.data?.status;
    } else if (selectedWorker?.status) {
       status = selectedWorker.status;
    }

    switch (status) {
      case 'logged_in':
      case 'connected':
        return { status, text: t('whatsapp.status.loggedIn'), className: 'text-success', icon: CheckCircle, subText: t('whatsapp.status.sub.whatsappOnline') };
      case 'running':
        return { status, text: t('whatsapp.status.running'), className: 'text-info', icon: Activity, subText: t('whatsapp.status.sub.waitingLogin') };
      case 'stopped':
        return { status, text: t('whatsapp.status.stopped'), className: 'text-error', icon: AlertCircle, subText: t('whatsapp.status.sub.serviceClosed') };
      case 'waiting_for_qr':
        return { status, text: t('whatsapp.status.waitingQr'), className: 'text-warning', icon: QrCode, subText: t('whatsapp.status.sub.scanQr') };
      case 'waiting_for_phone':
        return { status, text: t('whatsapp.status.waitingPhone'), className: 'text-info', icon: Phone, subText: t('whatsapp.status.sub.enterCode') };
      case 'creating':
        return { status, text: t('whatsapp.status.creating'), className: 'text-info', icon: Clock, subText: t('whatsapp.status.sub.initializing') };
      default:
        return { status, text: status || t('whatsapp.status.unknown'), className: 'text-text-secondary', icon: AlertCircle, subText: t('whatsapp.status.sub.checkConnection') };
    }
  };

  const statusDisplay = getLoginStatusDisplay();

  // Remove the blocking check for selectedWorker
  // instead, we'll conditionally render parts of the UI
  const isNewSession = !selectedWorker;

  if (isNewSession) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-main">{t('whatsapp.header.connectNew')}</h1>
            <p className="text-text-secondary mt-1">
              {t('whatsapp.header.createNewSubtitle')}
            </p>
          </div>
        </div>

        <div className="card max-w-2xl mx-auto mt-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-text-main">{t('whatsapp.header.createNew')}</h2>
            <p className="text-text-secondary mt-2">
              {t('whatsapp.header.createNewDesc')}
            </p>
          </div>

          <div className="space-y-6">
            {/* 登录方式选择 */}
            <div className="grid grid-cols-2 gap-4 p-1 bg-bg rounded-lg">
              <button
                onClick={() => setLoginForm({...loginForm, signin_type: 40})}
                className={`flex items-center justify-center space-x-2 py-3 rounded-md transition-all ${
                  loginForm.signin_type === 40 
                    ? 'bg-white shadow-sm text-primary font-medium' 
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>{t('whatsapp.login.phoneMethod')}</span>
              </button>
              <button
                onClick={() => setLoginForm({...loginForm, signin_type: 30})}
                className={`flex items-center justify-center space-x-2 py-3 rounded-md transition-all ${
                  loginForm.signin_type === 30 
                    ? 'bg-white shadow-sm text-primary font-medium' 
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>{t('whatsapp.login.qrMethod')}</span>
              </button>
            </div>

            {/* 手机号输入 */}
            {loginForm.signin_type === 40 && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  {t('whatsapp.login.phoneLabel')}
                </label>
                <input
                  type="text"
                  value={loginForm.login_phone}
                  onChange={(e) => setLoginForm({...loginForm, login_phone: e.target.value})}
                  placeholder={t('whatsapp.login.phonePlaceholder')}
                  className="input-field w-full text-lg"
                />
                <p className="mt-2 text-xs text-text-secondary">
                  {t('whatsapp.login.phoneHint')}
                </p>
              </div>
            )}

            {/* 选项 */}
            <div className="flex items-center justify-between py-2">
              <label className="flex items-center text-sm text-text-main cursor-pointer">
                <input
                  type="checkbox"
                  checked={loginForm.is_cache_login}
                  onChange={(e) => setLoginForm({...loginForm, is_cache_login: e.target.checked})}
                  className="mr-2 rounded text-primary focus:ring-primary"
                />
                {t('whatsapp.login.cache')}
              </label>
              
              <button
                onClick={() => setLoginForm({...loginForm, enableProxy: !loginForm.enableProxy})}
                className="text-sm text-primary hover:text-primary-dark transition-colors"
              >
                {loginForm.enableProxy ? t('whatsapp.login.disableProxy') : t('whatsapp.login.enableProxy')}
              </button>
            </div>

            {/* 代理设置 */}
            {loginForm.enableProxy && (
              <div className="p-4 bg-bg rounded-lg space-y-4 border border-border">
                <h4 className="font-medium text-text-main text-sm">{t('whatsapp.login.proxyTitle')}</h4>
                
                {/* 快捷输入区域 */}
                <div className="bg-gray-50 p-3 rounded border border-gray-200">
                    <label className="block text-xs font-medium text-gray-700 mb-1">{t('whatsapp.login.quickLabel')}</label>
                    <input
                        type="text"
                        value={loginForm.quickInput}
                        onChange={handleLoginQuickInputChange}
                        placeholder={t('whatsapp.login.quickPlaceholder')}
                        className="input-field w-full font-mono text-sm py-1.5"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.login.ip')}</label>
                    <input
                      type="text"
                      value={loginForm.socks5.ip}
                      onChange={(e) => setLoginForm({
                        ...loginForm, 
                        socks5: {...loginForm.socks5, ip: e.target.value}
                      })}
                      className="input-field w-full"
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.login.port')}</label>
                    <input
                      type="text"
                      value={loginForm.socks5.port}
                      onChange={(e) => setLoginForm({
                        ...loginForm, 
                        socks5: {...loginForm.socks5, port: e.target.value}
                      })}
                      className="input-field w-full"
                      placeholder="1080"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.login.user')}</label>
                    <input
                      type="text"
                      value={loginForm.socks5.user}
                      onChange={(e) => setLoginForm({
                        ...loginForm, 
                        socks5: {...loginForm.socks5, user: e.target.value}
                      })}
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.login.pwd')}</label>
                    <input
                      type="password"
                      value={loginForm.socks5.pwd}
                      onChange={(e) => setLoginForm({
                        ...loginForm, 
                        socks5: {...loginForm.socks5, pwd: e.target.value}
                      })}
                      className="input-field w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="pt-4">
              <button
                onClick={handleLogin}
                disabled={loading || (loginForm.signin_type === 40 && !loginForm.login_phone)}
                className="btn-primary w-full py-3 flex items-center justify-center space-x-2 text-lg"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="small" color="white" />
                    <span>{t('common.start')}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>{t('whatsapp.login.createAndConnect')}</span>
                  </>
                )}
              </button>
            </div>
            
            {/* 二维码显示 */}
            {qrCode && (
              <div className="mt-6 p-6 bg-white border-2 border-dashed border-border rounded-xl text-center animate-fade-in">
                <QrCode className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="text-sm text-text-secondary mb-4">{t('whatsapp.login.enterQrBelow')}</p>
                <img src={qrCode} alt="QR Code" className="mx-auto max-w-xs shadow-lg rounded-lg" />
              </div>
            )}

            {/* 配对码显示 */}
            {pairingCode && (
              <div className="mt-6 p-6 bg-primary/5 border-2 border-dashed border-primary/20 rounded-xl text-center animate-fade-in">
                <Code className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="text-sm text-text-secondary mb-2">{t('whatsapp.login.enterPairingCode')}</p>
                <div className="text-3xl font-mono font-bold text-primary tracking-widest my-4 bg-white py-3 px-6 rounded-lg inline-block shadow-sm">
                  {pairingCode}
                </div>
                <p className="text-xs text-text-secondary">
                  {t('whatsapp.login.pairingCodeHint')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between bg-surface p-6 rounded-2xl shadow-sm border border-border">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{t('sidebar.menu.whatsapp')}</h1>
          <div className="flex items-center mt-2 space-x-3 text-sm">
            <span className="font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {selectedWorker.name || `Worker ${selectedWorker.id}`}
            </span>
            <span className="text-border">|</span>
            <span className="text-text-secondary font-mono">{t('dashboard.port')}: {selectedWorker.port}</span>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3 bg-bg px-4 py-2 rounded-xl">
            <statusDisplay.icon className={`w-5 h-5 ${statusDisplay.className}`} />
            <span className={`font-bold ${statusDisplay.className}`}>
              {statusDisplay.text}
            </span>
          </div>
          <button 
            onClick={checkLoginStatus} 
            className={`p-2.5 rounded-xl hover:bg-bg text-text-secondary hover:text-primary transition-all duration-200 ${loading ? 'animate-spin text-primary' : ''}`}
            title={t('common.refresh')}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          {/* 启动/停止控制按钮 */}
          {statusDisplay.status === 'stopped' ? (
             <button
                onClick={handleStartWorker}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors font-medium text-sm"
             >
                <LogIn className="w-4 h-4" />
                <span>{t('common.start')}</span>
             </button>
          ) : (
             <>
               <button
                  onClick={handleStopWorker}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors font-medium text-sm"
               >
                  <Shield className="w-4 h-4" />
                  <span>{t('common.stop')}</span>
               </button>
               <button
                  onClick={handleRestartUpdate}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors font-medium text-sm"
               >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('whatsapp.detail.restartUpdate')}</span>
               </button>
             </>
          )}
        </div>
      </div>

      {/* 功能标签页 */}
      <div className="flex space-x-2 bg-surface p-1.5 rounded-xl shadow-sm border border-border overflow-x-auto">
        {[
          { id: 'login', label: t('whatsapp.tabs.login'), icon: LogIn },
          { id: 'proxy', label: t('whatsapp.tabs.proxy'), icon: Globe },
          { id: 'messages', label: t('whatsapp.tabs.messages'), icon: MessageSquare },
          { id: 'groups', label: t('whatsapp.tabs.groups'), icon: Users },
          { id: 'contacts', label: t('whatsapp.tabs.contacts'), icon: Users },
          { id: 'debug', label: t('whatsapp.tabs.debug'), icon: Terminal },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-md shadow-primary/30'
                : 'text-text-secondary hover:bg-bg hover:text-text-main'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-8 min-h-[500px]">
        
        {/* 登录管理 - Always show if activeTab is login OR isNewSession */}
        {(activeTab === 'login' || isNewSession) && (
          <div className="space-y-8 animate-fade-in">
            {/* 已登录状态显示 */}
            {(loginStatus?.status === 'logged_in' || loginStatus?.data?.status === 'logged_in') ? (
                <div className="bg-green-50 rounded-xl p-8 text-center border border-green-200">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 mb-2">已成功登录</h2>
                  <p className="text-green-700 mb-8">WhatsApp 服务正在运行中，您可以开始使用了</p>
                  
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={() => setActiveTab('messages')}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center font-medium shadow-md shadow-green-600/20"
                    >
                      <MessageSquare className="w-5 h-5 mr-2" />
                      开始发消息
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-6 py-3 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center font-medium"
                    >
                      <LogOut className="w-5 h-5 mr-2" />
                      退出登录
                    </button>
                  </div>
                </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-bold text-text-main">{t('whatsapp.login.configTitle')}</h3>
                  <p className="text-sm text-text-secondary mt-1">{t('whatsapp.login.configDesc')}</p>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-3">{t('whatsapp.login.method')}</label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${loginForm.signin_type === 40 ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50 text-text-secondary'}`}>
                        <input
                          type="radio"
                          value={40}
                          checked={loginForm.signin_type === 40}
                          onChange={(e) => setLoginForm({...loginForm, signin_type: parseInt(e.target.value)})}
                          className="hidden"
                        />
                        <Phone className="w-5 h-5 mr-2" />
                        <span className="font-semibold">手机号登录</span>
                      </label>
                      <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${loginForm.signin_type === 30 ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50 text-text-secondary'}`}>
                        <input
                          type="radio"
                          value={30}
                          checked={loginForm.signin_type === 30}
                          onChange={(e) => setLoginForm({...loginForm, signin_type: parseInt(e.target.value)})}
                          className="hidden"
                        />
                        <QrCode className="w-5 h-5 mr-2" />
                        <span className="font-semibold">二维码登录</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-2">{t('whatsapp.login.identityLabel')}</label>
                    <input
                      type="text"
                      value={loginForm.login_phone}
                      onChange={(e) => setLoginForm({...loginForm, login_phone: e.target.value})}
                      placeholder={t('whatsapp.login.identityPlaceholder')}
                      className="input-field w-full"
                    />
                    <p className="mt-2 text-xs text-text-secondary flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {t('whatsapp.login.identityHint')}
                    </p>
                  </div>

                  <div className="flex items-center space-x-6 bg-bg/50 p-4 rounded-xl">
                    <label className="flex items-center text-sm font-medium text-text-main cursor-pointer select-none group">
                      <div className={`w-5 h-5 rounded border mr-2 flex items-center justify-center transition-colors ${loginForm.is_cache_login ? 'bg-primary border-primary' : 'border-text-secondary bg-white'}`}>
                        {loginForm.is_cache_login && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={loginForm.is_cache_login}
                        onChange={(e) => setLoginForm({...loginForm, is_cache_login: e.target.checked})}
                        className="hidden"
                      />
                      {t('whatsapp.login.useCache')}
                    </label>
                    <label className="flex items-center text-sm font-medium text-text-main cursor-pointer select-none group">
                      <div className={`w-5 h-5 rounded border mr-2 flex items-center justify-center transition-colors ${loginForm.enableProxy ? 'bg-primary border-primary' : 'border-text-secondary bg-white'}`}>
                        {loginForm.enableProxy && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={loginForm.enableProxy}
                        onChange={(e) => setLoginForm({...loginForm, enableProxy: e.target.checked})}
                        className="hidden"
                      />
                      {t('whatsapp.login.enableProxyShort')}
                    </label>
                  </div>

                  {loginForm.enableProxy && (
                    <div className="bg-bg rounded-xl p-5 space-y-4 border border-border animate-fade-in">
                      <h4 className="text-sm font-bold text-text-main flex items-center">
                        <Globe className="w-4 h-4 mr-2 text-primary" />
                        {t('whatsapp.login.proxyTitle')}
                      </h4>
                      
                      {/* 快捷输入区域 */}
                      <div className="bg-gray-50 p-3 rounded border border-gray-200">
                        <label className="block text-xs font-medium text-gray-700 mb-1">{t('whatsapp.login.quickLabel')}</label>
                        <input
                            type="text"
                            value={loginForm.quickInput}
                            onChange={handleLoginQuickInputChange}
                            placeholder={t('whatsapp.login.quickPlaceholder')}
                            className="input-field w-full font-mono text-sm py-1.5"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <input
                            type="text"
                            placeholder={t('whatsapp.login.ip')}
                            value={loginForm.socks5.ip}
                            onChange={(e) => setLoginForm({...loginForm, socks5: {...loginForm.socks5, ip: e.target.value}})}
                            className="input-field w-full"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder={t('whatsapp.login.port')}
                          value={loginForm.socks5.port}
                          onChange={(e) => setLoginForm({...loginForm, socks5: {...loginForm.socks5, port: e.target.value}})}
                          className="input-field w-full"
                        />
                        <input
                          type="text"
                          placeholder={t('whatsapp.login.user')}
                          value={loginForm.socks5.user}
                          onChange={(e) => setLoginForm({...loginForm, socks5: {...loginForm.socks5, user: e.target.value}})}
                          className="input-field w-full"
                        />
                        <input
                          type="password"
                          placeholder={t('whatsapp.login.pwd')}
                          value={loginForm.socks5.pwd}
                          onChange={(e) => setLoginForm({...loginForm, socks5: {...loginForm.socks5, pwd: e.target.value}})}
                          className="input-field w-full col-span-2"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-4">
                    <button
                      onClick={handleLogin}
                      disabled={loading}
                      className="btn-primary w-full py-3 flex items-center justify-center space-x-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 text-lg"
                    >
                      {loading ? <LoadingSpinner size="small" /> : <LogIn className="w-4 h-4" />}
                      <span>{isNewSession ? t('whatsapp.login.createAndConnect') : t('whatsapp.login.start')}</span>
                    </button>
                    {!isNewSession && (
                      <>
                        <button
                          onClick={handleLogout}
                          disabled={loading}
                          className="btn-secondary flex items-center justify-center space-x-2"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>{t('whatsapp.login.exit')}</span>
                        </button>
                        <button
                          onClick={handleCloseWorker}
                          disabled={loading}
                          className="btn-secondary bg-red-50 text-red-600 hover:bg-red-100"
                          title={t('whatsapp.login.closeWorkerTitle')}
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 flex flex-col items-center justify-center min-h-[300px]">
                {qrCode ? (
                  <div className="text-center">
                    <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
                      <img src={qrCode} alt="QR Code" className="w-48 h-48 mx-auto" />
                    </div>
                    <p className="text-gray-600 font-medium">{t('whatsapp.login.qrHint')}</p>
                  </div>
                ) : pairingCode ? (
                  <div className="text-center">
                    <div className="bg-blue-100 p-6 rounded-lg mb-4">
                      <p className="text-4xl font-mono font-bold text-blue-700 tracking-wider">{pairingCode}</p>
                    </div>
                    <p className="text-gray-600 font-medium">{t('whatsapp.login.pairingHintPhone')}</p>
                  </div>
                ) : (loginStatus?.status === 'logged_in' || loginStatus?.data?.status === 'logged_in') ? (
                  <div className="text-center">
                <div className="bg-green-100 p-6 rounded-full mb-4 w-24 h-24 mx-auto flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-green-700 mb-2">{t('whatsapp.status.loggedIn')}</h3>
                <p className="text-gray-600">{t('whatsapp.status.sub.whatsappOnline')}</p>
                <div className="mt-6 flex justify-center space-x-4">
                  <button onClick={() => setActiveTab('messages')} className="btn-primary text-sm">
                    {t('whatsapp.login.viewMessages')}
                  </button>
                  <button onClick={() => setActiveTab('contacts')} className="btn-secondary text-sm">
                    {t('whatsapp.login.viewContacts')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <Phone className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t('whatsapp.login.waitToStart')}</p>
              </div>
            )}
          </div>
          </div>
        )}
          </div>
        )}

        {/* 代理设置 */}
        {activeTab === 'proxy' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">{t('whatsapp.proxy.title')}</h3>
              <div className="flex space-x-2">
                <button onClick={handleDetectProxy} className="btn-secondary text-sm">
                  {t('whatsapp.proxy.detect')}
                </button>
                <button onClick={checkProxyStatus} className="btn-secondary text-sm">
                  {t('whatsapp.proxy.refresh')}
                </button>
              </div>
            </div>

            {proxyStatus && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <Globe className="w-5 h-5 text-blue-600 mt-1" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 flex items-center">
                        {t('whatsapp.proxy.currentConfig')}
                        {proxyStatus.enabled ? 
                            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{t('whatsapp.proxy.enabled')}</span> : 
                            <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{t('whatsapp.proxy.disabled')}</span>
                        }
                    </h4>
                    {proxyStatus.config ? (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-blue-800">
                            <div><span className="font-semibold">{t('whatsapp.proxy.ipLabel')}</span> {proxyStatus.config.ip}</div>
                            <div><span className="font-semibold">{t('whatsapp.proxy.portLabel')}</span> {proxyStatus.config.port}</div>
                            <div><span className="font-semibold">{t('whatsapp.proxy.userLabel')}</span> {proxyStatus.config.user || '-'}</div>
                            <div><span className="font-semibold">{t('whatsapp.proxy.pwdLabel')}</span> {proxyStatus.config.pwd || '-'}</div>
                            {proxyStatus.local_forwarder && (
                                <div className="col-span-2 text-xs text-blue-600 mt-1">
                                    <span className="font-semibold">{t('whatsapp.proxy.localForward')}:</span> {proxyStatus.local_forwarder}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-blue-700 mt-1">{t('whatsapp.proxy.noConfig')}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSwitchProxy} className="max-w-2xl space-y-4">
              {/* 快捷输入区域 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.proxy.quickLabel')}</label>
                <input
                  type="text"
                  value={proxyForm.quickInput}
                  onChange={handleQuickInputChange}
                  placeholder={t('whatsapp.proxy.quickPlaceholder')}
                  className="input-field w-full font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">{t('whatsapp.proxy.quickHint')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.proxy.protocol')}</label>
                  <select
                    value={proxyForm.protocol}
                    onChange={(e) => setProxyForm({...proxyForm, protocol: e.target.value})}
                    className="input-field"
                  >
                    <option value="socks5">SOCKS5</option>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.proxy.host')}</label>
                  <input
                    type="text"
                    value={proxyForm.host}
                    onChange={(e) => setProxyForm({...proxyForm, host: e.target.value})}
                    placeholder="127.0.0.1"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.proxy.port')}</label>
                  <input
                    type="text"
                    value={proxyForm.port}
                    onChange={(e) => setProxyForm({...proxyForm, port: e.target.value})}
                    placeholder="1080"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.proxy.username')}</label>
                  <input
                    type="text"
                    value={proxyForm.username}
                    onChange={(e) => setProxyForm({...proxyForm, username: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.proxy.password')}</label>
                  <input
                    type="password"
                    value={proxyForm.password}
                    onChange={(e) => setProxyForm({...proxyForm, password: e.target.value})}
                    className="input-field"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {t('whatsapp.proxy.switch')}
              </button>
            </form>
          </div>
        )}

        {/* 群组管理 */}
        {activeTab === 'groups' && (
          <div className="space-y-8 animate-fade-in">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* 创建群组 */}
               <div className="bg-bg p-6 rounded-xl border border-border">
                 <h3 className="text-lg font-bold text-text-main mb-4 flex items-center">
                   <Users className="w-5 h-5 mr-2 text-primary" />
                   {t('whatsapp.groups.createTitle')}
                 </h3>
                 <form onSubmit={handleCreateGroup} className="space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-text-secondary mb-1">{t('whatsapp.groups.nameLabel')}</label>
                     <input
                       type="text"
                       value={groupForm.name}
                       onChange={(e) => setGroupForm({...groupForm, name: e.target.value})}
                       placeholder={t('whatsapp.groups.namePlaceholder')}
                       className="input-field w-full"
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-text-secondary mb-1">{t('whatsapp.groups.membersLabel')}</label>
                     <textarea
                       value={groupForm.participants}
                       onChange={(e) => setGroupForm({...groupForm, participants: e.target.value})}
                       placeholder={t('whatsapp.groups.membersPlaceholder')}
                       rows={3}
                       className="input-field w-full"
                     />
                   </div>
                   <button type="submit" disabled={loading} className="btn-primary w-full">
                     {t('whatsapp.groups.createBtn')}
                   </button>
                 </form>
               </div>

               {/* 添加成员 */}
               <div className="bg-bg p-6 rounded-xl border border-border">
                 <h3 className="text-lg font-bold text-text-main mb-4 flex items-center">
                   <Users className="w-5 h-5 mr-2 text-primary" />
                   {t('whatsapp.groups.addTitle')}
                 </h3>
                 <form onSubmit={handleAddParticipants} className="space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-text-secondary mb-1">{t('whatsapp.groups.groupIdLabel')}</label>
                     <input
                       type="text"
                       value={groupForm.targetGroupId}
                       onChange={(e) => setGroupForm({...groupForm, targetGroupId: e.target.value})}
                       placeholder={t('whatsapp.groups.groupIdPlaceholder')}
                       className="input-field w-full"
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-text-secondary mb-1">{t('whatsapp.groups.newMembersLabel')}</label>
                     <textarea
                       value={groupForm.participants}
                       onChange={(e) => setGroupForm({...groupForm, participants: e.target.value})}
                       placeholder={t('whatsapp.groups.newMembersPlaceholder')}
                       rows={3}
                       className="input-field w-full"
                     />
                   </div>
                   <button type="submit" disabled={loading} className="btn-primary w-full">
                     {t('whatsapp.groups.addBtn')}
                   </button>
                 </form>
               </div>
             </div>
             
             <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
               <p className="font-bold mb-1">{t('whatsapp.groups.tipsTitle')}</p>
               <ul className="list-disc list-inside space-y-1">
                 <li>{t('whatsapp.groups.tip1')}</li>
                 <li>{t('whatsapp.groups.tip2')}</li>
                 <li>{t('whatsapp.groups.tip3')}</li>
               </ul>
             </div>
          </div>
        )}

        {/* 消息管理 */}
        {activeTab === 'messages' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 border-r pr-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('whatsapp.messages.sendTitle')}</h3>
                <form onSubmit={handleSendMessage} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.messages.contactLabel')}</label>
                    <input
                      type="text"
                      value={messageForm.contact}
                      onChange={(e) => setMessageForm({...messageForm, contact: e.target.value})}
                      placeholder={t('whatsapp.messages.contactPlaceholder')}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatsapp.messages.contentLabel')}</label>
                    <textarea
                      value={messageForm.message}
                      onChange={(e) => setMessageForm({...messageForm, message: e.target.value})}
                      rows={4}
                      className="input-field"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    <Send className="w-4 h-4 mr-2 inline" /> {t('whatsapp.messages.sendBtn')}
                  </button>
                </form>
              </div>
              
              <div className="lg:col-span-2">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{t('whatsapp.messages.receivedTitle')}</h3>
                  <button onClick={() => loadMessages()} className="text-blue-600 hover:text-blue-800 text-sm">
                    {t('whatsapp.messages.refreshList')}
                  </button>
                </div>
                <div className="space-y-2 h-[400px] overflow-y-auto pr-2">
                  {messages.length > 0 ? (
                    messages.map((msg, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-gray-900">
                            {msg.notifyName || msg.author || msg.from || msg.contact || t('whatsapp.messages.unknownSender')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : t('whatsapp.messages.unknownTime')}
                          </span>
                        </div>
                        <p className="text-gray-700">{msg.body || msg.message || msg.content || t('whatsapp.messages.noContent')}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-12">{t('whatsapp.messages.empty')}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 联系人 */}
        {activeTab === 'contacts' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-text-main">{t('whatsapp.contacts.title')}</h3>
                <p className="text-sm text-text-secondary mt-1">{t('whatsapp.contacts.subtitle')}</p>
              </div>
              <div className="flex space-x-2">
                {/* 添加联系人触发器 - 这里为了简单，直接显示内联表单或使用Popover，这里先放一个添加区域在列表上方 */}
              </div>
              <button 
                onClick={() => loadContacts()} 
                className="btn-secondary text-sm flex items-center space-x-2" 
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{t('whatsapp.contacts.refresh')}</span>
              </button>
            </div>
            
            {/* 添加联系人表单区域 */}
            <div className="bg-bg p-4 rounded-xl border border-border">
                <h4 className="font-bold text-text-main mb-3 flex items-center">
                    <Plus className="w-4 h-4 mr-2 text-primary" />
                    {t('whatsapp.contacts.addTitle')}
                </h4>
                <form onSubmit={handleAddContact} className="flex gap-4 items-end flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.contacts.phoneLabel')}</label>
                        <input 
                            type="text" 
                            placeholder={t('whatsapp.contacts.phonePlaceholder')}
                            value={addContactForm.phone}
                            onChange={e => setAddContactForm({...addContactForm, phone: e.target.value})}
                            className="input-field w-full py-2"
                        />
                    </div>
                    <div className="w-[120px]">
                        <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.contacts.firstNameLabel')}</label>
                        <input 
                            type="text" 
                            placeholder={t('whatsapp.contacts.firstNamePlaceholder')}
                            value={addContactForm.firstName}
                            onChange={e => setAddContactForm({...addContactForm, firstName: e.target.value})}
                            className="input-field w-full py-2"
                        />
                    </div>
                    <div className="w-[120px]">
                        <label className="block text-xs text-text-secondary mb-1">{t('whatsapp.contacts.lastNameLabel')}</label>
                        <input 
                            type="text" 
                            placeholder={t('whatsapp.contacts.lastNamePlaceholder')}
                            value={addContactForm.lastName}
                            onChange={e => setAddContactForm({...addContactForm, lastName: e.target.value})}
                            className="input-field w-full py-2"
                        />
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary py-2 px-4 h-[42px]">
                        {t('whatsapp.contacts.addBtn')}
                    </button>
                </form>
                <p className="text-xs text-text-secondary mt-2">
                    {t('whatsapp.contacts.tip')}
                </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.length > 0 ? (
                contacts.map((contact, idx) => (
                  <div 
                    key={idx} 
                    className="bg-surface p-4 rounded-xl border border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-4 overflow-hidden flex-1">
                      <div className="w-12 h-12 bg-bg rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border">
                        {contact.avatar ? (
                           <img 
                             src={contact.avatar.replace(/`/g, '').trim()} 
                             alt={contact.name} 
                             className="w-full h-full object-cover"
                             onError={(e) => {e.target.onerror = null; e.target.src = ''; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block';}} 
                           />
                        ) : (
                          <Users className="w-6 h-6 text-text-secondary" />
                        )}
                        <Users className="w-6 h-6 text-text-secondary hidden" />
                      </div>
                      <div className="overflow-hidden flex-1 min-w-0">
                        <p className="font-bold text-text-main truncate" title={contact.name || contact.id}>
                          {contact.name || contact.pushname || contact.id || t('whatsapp.contacts.unknownUser')}
                        </p>
                        <p className="text-xs text-text-secondary truncate mt-0.5" title={contact.id || contact.number}>
                          {contact.id?.split('@')[0] || contact.number || t('whatsapp.contacts.unknownNumber')}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        // 如果是群组（isGroup=true）或 ID 包含 g.us，使用完整 ID
                        // 否则如果是个人（包含 c.us 或无后缀），使用号码部分
                        const isGroup = contact.isGroup || (contact.id && contact.id.includes('g.us'));
                        let targetContact;
                        
                        if (isGroup) {
                            // 优先使用 serialized ID，否则使用原始 ID
                            targetContact = contact.id;
                        } else {
                            // 个人用户，提取号码部分
                            targetContact = contact.id?.split('@')[0] || contact.number || contact.name;
                        }
                        
                        setMessageForm(prev => ({ ...prev, contact: targetContact }));
                        setActiveTab('messages');
                        toast.success(`已选择联系人: ${contact.name || targetContact}`);
                      }}
                      className="p-2.5 rounded-full text-text-secondary hover:text-primary hover:bg-primary/10 transition-all duration-200 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0"
                      title={t('whatsapp.contacts.sendTitle')}
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center py-20 bg-bg/50 rounded-2xl border-2 border-dashed border-border">
                  <Users className="w-12 h-12 text-text-secondary mb-4 opacity-50" />
                  <p className="text-text-secondary font-medium">
                    {loading ? t('whatsapp.contacts.loading') : t('whatsapp.contacts.empty')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 调试工具 */}
        {activeTab === 'debug' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">调试工具</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <Code className="w-8 h-8 text-blue-500 mb-3" />
                <h4 className="font-medium text-gray-900 mb-2">页面快照</h4>
                <p className="text-sm text-gray-500 mb-4">获取当前WhatsApp页面的HTML源码</p>
                <button onClick={handleGetDebugHtml} className="btn-secondary w-full">
                  查看HTML
                </button>
              </div>
              <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <Activity className="w-8 h-8 text-green-500 mb-3" />
                <h4 className="font-medium text-gray-900 mb-2">元素检测</h4>
                <p className="text-sm text-gray-500 mb-4">检查页面关键元素是否存在</p>
                <button className="btn-secondary w-full" onClick={handleGetDebugElements}>
                  运行检测
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default WhatsAppControl;
