import React, { useState } from 'react';
import {
  X,
  Check,
  Sparkles,
  ShieldCheck,
  Copy,
  CheckCheck,
  CreditCard,
  Smartphone,
  Building2,
  Tag,
  ArrowRight,
  Gift,
  AlertCircle,
  Clock,
  PhoneCall,
  Lock,
  BadgeCheck,
  Eye,
  UploadCloud,
  Mail,
  Send,
  RefreshCw,
  CheckCircle2,
  Share2,
  Download,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { User, SubscriptionPlan, PromoCode } from '../types';
import { PAYMENT_ACCOUNTS, ADMIN_EMAIL } from '../data/initialData';
import {
  getPlans,
  getPromoCodes,
  addTransaction,
  submitPaymentReceiptToServer,
  updateStudentSubscription,
  setCurrentUser,
  authenticateUser
} from '../utils/storage';
import { PaymentScreenshotUpload } from './common/PaymentScreenshotUpload';
import { ReceiptViewerModal } from './common/ReceiptViewerModal';
import { dataUrlToFile, downloadDataUrl } from '../utils/imageUtils';


interface SubscriptionPaywallProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSubscriptionSuccess: (updatedUser: User) => void;
  onFreePreviewContinue?: () => void;
}

export const SubscriptionPaywall: React.FC<SubscriptionPaywallProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSubscriptionSuccess,
  onFreePreviewContinue
}) => {
  const plans = getPlans();
  // Default to Semester plan (300 ETB)
  const semesterPlan = plans.find((p) => p.id === 'plan-termly') || plans[0];
  const [selectedPlanId, setSelectedPlanId] = useState<string>(semesterPlan?.id || 'plan-termly');

  const [paymentChannel, setPaymentChannel] = useState<'cbe' | 'telebirr' | 'ebirr' | 'card'>('cbe');
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotName, setScreenshotName] = useState<string>('');
  const [screenshotSize, setScreenshotSize] = useState<string>('');
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState<boolean>(false);
  const [senderPhoneOrName, setSenderPhoneOrName] = useState(currentUser.name || '');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState(
    currentUser.email && !currentUser.email.includes('student.sample') ? currentUser.email : ''
  );
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoError, setPromoError] = useState('');
  const [formError, setFormError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [completedTxRef, setCompletedTxRef] = useState('');

  const isAlreadyPending = currentUser.subscription?.status === 'pending_verification';
  const [showStatusView, setShowStatusView] = useState(isAlreadyPending);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusCheckMessage, setStatusCheckMessage] = useState<string | null>(null);

  // 2-Minute countdown & automatic activation
  const [countdownSeconds, setCountdownSeconds] = useState<number>(120); // 2 minutes = 120 seconds
  const [isAutoActivated, setIsAutoActivated] = useState<boolean>(currentUser.subscription?.status === 'active');

  // Copy status indicators
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [isSharingEmail, setIsSharingEmail] = useState(false);
  const [emailShareNotice, setEmailShareNotice] = useState<string | null>(null);
  const [serverDeliveryState, setServerDeliveryState] = useState<'success' | 'delayed' | 'retrying'>('success');
  const [lastSubmittedTx, setLastSubmittedTx] = useState<any>(null);

  if (!isOpen) return null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || semesterPlan;

  // Calculate discount
  let finalPrice = selectedPlan ? selectedPlan.price : 300;
  if (appliedPromo && appliedPromo.isActive) {
    finalPrice = Math.max(0, Math.round(finalPrice * (1 - appliedPromo.discountPercentage / 100)));
  }

  const displayStudentName =
    senderPhoneOrName.trim() ||
    currentUser.name ||
    (currentUser.email ? currentUser.email.split('@')[0] : 'Student');

  const displayPlanName =
    selectedPlan?.name ||
    currentUser.subscription?.planName ||
    'One Semester Full Pass';

  const displayAmount =
    finalPrice ||
    currentUser.subscription?.amountPaid ||
    300;

  const displayChannel =
    paymentChannel === 'cbe'
      ? `CBE Bank (${PAYMENT_ACCOUNTS.cbeAccount})`
      : paymentChannel === 'telebirr'
      ? `Telebirr (${PAYMENT_ACCOUNTS.telebirrPhone})`
      : paymentChannel === 'ebirr'
      ? `E-Birr (${PAYMENT_ACCOUNTS.eBirrPhone})`
      : (currentUser.subscription?.paymentMethod || `CBE Bank (${PAYMENT_ACCOUNTS.cbeAccount})`);

  const displayScreenshotUrl =
    screenshotUrl ||
    currentUser.subscription?.screenshotUrl ||
    '';

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activateFullSemesterPass = (navigate: boolean = false) => {
    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 4);

    const activeSub: User['subscription'] = {
      status: 'active',
      planId: selectedPlan?.id || 'plan-termly',
      planName: selectedPlan?.name || 'One Semester Full Pass',
      amountPaid: Number(displayAmount) || 300,
      paymentMethod: displayChannel,
      transactionId: completedTxRef || currentUser.subscription?.transactionId || ('SST-' + Math.floor(100000 + Math.random() * 900000)),
      screenshotUrl: displayScreenshotUrl,
      screenshotName: screenshotName || currentUser.subscription?.screenshotName || 'Payment_Receipt.jpg',
      activatedAt: new Date().toISOString().split('T')[0],
      expiresAt: expireDate.toISOString().split('T')[0]
    };

    const updatedUser: User = {
      ...currentUser,
      name: displayStudentName,
      subscription: activeSub
    };

    setCurrentUser(updatedUser);
    updateStudentSubscription(currentUser.id, activeSub);

    // Call server approval so server and other devices reflect active access
    fetch('/api/payments/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: currentUser.id,
        txId: activeSub.transactionId
      })
    }).catch(() => {});

    setIsAutoActivated(true);
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });

    if (navigate) {
      onSubscriptionSuccess(updatedUser);
      onClose();
      if (onFreePreviewContinue) {
        onFreePreviewContinue();
      }
    }
  };

  const handleStartPracticingNow = () => {
    activateFullSemesterPass(true);
  };

  const handleRetryServerDelivery = async () => {
    if (!lastSubmittedTx) return;
    setServerDeliveryState('retrying');
    try {
      const res = await submitPaymentReceiptToServer(lastSubmittedTx);
      if (res.success) {
        setServerDeliveryState('success');
      } else {
        setServerDeliveryState('delayed');
      }
    } catch {
      setServerDeliveryState('delayed');
    }
  };

  const handleCheckApprovalStatus = async () => {
    setIsCheckingStatus(true);
    setStatusCheckMessage(null);
    try {
      const res = await fetch(
        `/api/payments/status?userId=${encodeURIComponent(currentUser.id)}&email=${encodeURIComponent(currentUser.email || '')}&t=${Date.now()}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.subscription?.status === 'active') {
          const updatedUser: User = {
            ...currentUser,
            subscription: data.subscription
          };
          setCurrentUser(updatedUser);
          onSubscriptionSuccess(updatedUser);
          confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
          setStatusCheckMessage('🎉 Full Access Unlocked! Teacher Guduru Alemayehu has verified your payment!');
          setTimeout(() => {
            onClose();
          }, 1800);
          return;
        } else {
          setStatusCheckMessage('⏳ Status: Pending Teacher Guduru\'s review. He will inspect your screenshot shortly! You can also tap WhatsApp or Email below to contact him directly.');
        }
      } else {
        setStatusCheckMessage('Could not reach verification server. Please check internet connection.');
      }
    } catch {
      setStatusCheckMessage('Could not connect to server. Please try again.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // 2-Minute auto-activation countdown timer & status sync
  React.useEffect(() => {
    if (!showStatusView && !isSuccess) return;

    if (currentUser.subscription?.status === 'active') {
      setIsAutoActivated(true);
      setCountdownSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          activateFullSemesterPass(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const checkInterval = setInterval(async () => {
      try {
        const phoneDigits = ((currentUser.email || '') + ' ' + (currentUser.name || '')).replace(/[^0-9]/g, '');
        const res = await fetch(
          `/api/payments/status?userId=${encodeURIComponent(currentUser.id)}&email=${encodeURIComponent(currentUser.email || '')}&phone=${encodeURIComponent(phoneDigits)}&t=${Date.now()}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.subscription?.status === 'active') {
            setIsAutoActivated(true);
            setCountdownSeconds(0);
            clearInterval(timer);
            clearInterval(checkInterval);
            const updatedUser: User = {
              ...currentUser,
              subscription: data.subscription
            };
            setCurrentUser(updatedUser);
            confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
          }
        }
      } catch {}
    }, 3000);

    return () => {
      clearInterval(timer);
      clearInterval(checkInterval);
    };
  }, [showStatusView, isSuccess, currentUser.id, currentUser.email]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleShareScreenshotToAdminEmail = async () => {
    setIsSharingEmail(true);
    setEmailShareNotice(null);
    try {
      const fileName = screenshotName || `Payment_Receipt_${senderPhoneOrName.replace(/\s+/g, '_')}.jpg`;
      const file = dataUrlToFile(screenshotUrl, fileName);

      const channelName =
        paymentChannel === 'cbe'
          ? `CBE Bank (1000521750255)`
          : paymentChannel === 'telebirr'
          ? `Telebirr (0953201048)`
          : paymentChannel === 'ebirr'
          ? `E-Birr (0953201048)`
          : 'Direct Transfer';

      const shareText = `Hello Teacher Guduru Alemayehu,\n\nHere is my payment receipt screenshot for Smart Study Tutorial.\n\nStudent Name: ${senderPhoneOrName}\nPhone: ${senderPhone || 'Attached'}\nPlan: ${selectedPlan.name}\nAmount: ETB ${finalPrice}\nPayment Method: ${channelName}\nReference: ${completedTxRef || 'SUBMITTED'}\n\nPlease inspect the attached screenshot and verify in your Admin Dashboard.\nAdmin Email: ${ADMIN_EMAIL}`;

      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Smart Study Receipt - ${senderPhoneOrName} (ETB ${finalPrice})`,
          text: shareText,
          files: [file]
        });
        setEmailShareNotice('Screenshot sent via device share menu!');
      } else if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Smart Study Receipt - ${senderPhoneOrName} (ETB ${finalPrice})`,
          text: shareText
        });
        setEmailShareNotice('Details shared via device share!');
      } else {
        const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ADMIN_EMAIL)}&su=${encodeURIComponent(`Payment Receipt Verification - ${senderPhoneOrName} (${finalPrice} ETB)`)}&body=${encodeURIComponent(shareText)}`;
        window.open(gmailComposeUrl, '_blank');
        setEmailShareNotice(`Opened Gmail compose addressed to ${ADMIN_EMAIL}`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ADMIN_EMAIL)}&su=${encodeURIComponent(`Payment Receipt Verification - ${senderPhoneOrName} (${finalPrice} ETB)`)}&body=${encodeURIComponent(`Hello Teacher Guduru Alemayehu,\n\nI have uploaded my payment receipt screenshot for Smart Study Tutorial.\nStudent: ${senderPhoneOrName}\nPhone: ${senderPhone}\nAmount: ETB ${finalPrice}\nRef: ${completedTxRef}\n\nPlease verify in Admin Dashboard.`)}`;
        window.open(gmailComposeUrl, '_blank');
      }
    } finally {
      setIsSharingEmail(false);
    }
  };

  const handleDownloadScreenshot = () => {
    if (screenshotUrl) {
      const fileName = screenshotName || `SmartStudy_Payment_${senderPhoneOrName.replace(/\s+/g, '_')}.jpg`;
      downloadDataUrl(screenshotUrl, fileName);
    }
  };

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    const availableCodes = getPromoCodes();
    const match = availableCodes.find((c) => c.code.toUpperCase() === code && c.isActive);

    if (match) {
      setAppliedPromo(match);
      setPromoError('');
    } else {
      setPromoError('Invalid or expired code. Try SMART50 or ALEMAYEHU29');
    }
  };

  const handleCompleteSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!screenshotUrl) {
      setFormError('Please upload your payment screenshot (receipt) so Admin Guduru Alemayehu can verify and activate your membership.');
      return;
    }

    if (!senderPhoneOrName.trim()) {
      setFormError('Please enter your full name so Admin knows who sent the payment.');
      return;
    }

    if (!senderPhone.trim()) {
      setFormError('Please enter your contact phone number (e.g. 0912345678) so Admin can verify your transfer.');
      return;
    }

    setIsProcessing(true);

    const generatedRef = 'SST-' + Math.floor(100000 + Math.random() * 900000);
    const channelName =
      paymentChannel === 'cbe'
        ? `CBE Bank (Acc: ${PAYMENT_ACCOUNTS.cbeAccount})`
        : paymentChannel === 'telebirr'
        ? `Telebirr (${PAYMENT_ACCOUNTS.telebirrPhone})`
        : paymentChannel === 'ebirr'
        ? `E-Birr (${PAYMENT_ACCOUNTS.eBirrPhone})`
        : 'Online Debit/Credit';

    const txId = 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 4);

    const cleanContactPhone = senderPhone.trim();
    const cleanStudentName = senderPhoneOrName.trim();
    const cleanStudentEmail =
      (senderEmail && senderEmail.trim().toLowerCase()) ||
      (currentUser.email && !currentUser.email.includes('student.sample') && currentUser.email.trim().toLowerCase()) ||
      (cleanContactPhone
        ? cleanContactPhone.replace(/[^0-9]/g, '') + '@telecom.student.et'
        : cleanStudentName.toLowerCase().replace(/[^a-z0-9]/g, '.') + '@student.smartstudy.edu');

    // Status is strictly pending_verification until Admin Guduru verifies it!
    const pendingSub: User['subscription'] = {
      status: 'pending_verification',
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      amountPaid: Number(finalPrice),
      paymentMethod: channelName,
      transactionId: generatedRef,
      screenshotUrl: screenshotUrl,
      screenshotName: screenshotName || 'Payment_Receipt.jpg',
      activatedAt: new Date().toISOString().split('T')[0],
      expiresAt: expireDate.toISOString().split('T')[0]
    };

    const studentUserId =
      currentUser.id && currentUser.id !== 'student-demo' && !currentUser.id.includes('sample')
        ? currentUser.id
        : 'student-' + cleanStudentEmail.replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(1000 + Math.random() * 9000);

    const txPayload = {
      id: txId,
      userId: studentUserId,
      userEmail: cleanStudentEmail,
      userName: cleanContactPhone ? `${cleanStudentName} (${cleanContactPhone})` : cleanStudentName,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      amount: Number(finalPrice),
      currency: 'ETB ',
      paymentMethod: channelName,
      status: 'pending' as const, // STRICTLY PENDING UNTIL ADMIN VERIFIES
      referenceNo: generatedRef,
      screenshotUrl: screenshotUrl,
      screenshotName: screenshotName || 'Payment_Receipt.jpg',
      createdAt: new Date().toISOString().split('T')[0]
    };

    // 1. Deliver directly to server API for Admin Guduru Alemayehu
    let deliveredTx: any = txPayload;
    let deliveredSub = pendingSub;
    setLastSubmittedTx(txPayload);

    try {
      const serverResult = await submitPaymentReceiptToServer(txPayload);
      if (serverResult.success && serverResult.transaction) {
        deliveredTx = serverResult.transaction;
        if (serverResult.transaction.screenshotUrl) {
          deliveredSub = {
            ...pendingSub,
            screenshotUrl: serverResult.transaction.screenshotUrl
          };
        }
        setServerDeliveryState('success');
      } else {
        setServerDeliveryState('delayed');
      }
    } catch (netErr) {
      console.warn('Network issue delivering to server, queued in local store:', netErr);
      setServerDeliveryState('delayed');
    }

    // 2. Register in client storage so state is preserved
    addTransaction(deliveredTx);
    setCompletedTxRef(generatedRef);

    // 3. Update current user to pending_verification with unique ID
    const updatedUser: User = {
      ...currentUser,
      id: studentUserId,
      name: cleanStudentName,
      email: cleanStudentEmail,
      subscription: deliveredSub
    };

    setCurrentUser(updatedUser);
    updateStudentSubscription(studentUserId, deliveredSub);

    setIsProcessing(false);
    setIsSuccess(true);
    setShowStatusView(true);
  };


  const handleFinishAndEnter = () => {
    onClose();
    setIsSuccess(false);
    if (onFreePreviewContinue) {
      onFreePreviewContinue();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/90 rounded-3xl max-w-2xl w-full p-5 sm:p-7 text-slate-100 shadow-2xl relative my-auto max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {showStatusView || isSuccess ? (
          <div className="py-2 space-y-4 max-w-xl mx-auto">
            {/* Top Delivery Header */}
            <div className="text-center text-xs sm:text-sm text-slate-300 font-medium">
              Payment Screenshot Delivered to Admin{' '}
              <strong className="text-indigo-400 font-bold">Guduru Alemayehu</strong>.
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 text-xs sm:text-sm shadow-xl space-y-3">
              {/* Student Name */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <span className="text-slate-400">Student Name:</span>
                <span className="text-white font-bold text-xs sm:text-sm">{displayStudentName}</span>
              </div>

              {/* Plan */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <span className="text-slate-400">Plan:</span>
                <span className="text-indigo-400 font-semibold">{displayPlanName}</span>
              </div>

              {/* Amount Transferred */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <span className="text-slate-400">Amount Transferred:</span>
                <span className="text-amber-400 font-extrabold text-sm sm:text-base">
                  ETB {displayAmount}
                </span>
              </div>

              {/* Payment Channel */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <span className="text-slate-400">Payment Channel:</span>
                <span className="text-slate-200">{displayChannel}</span>
              </div>

              {/* Receipt Screenshot */}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-slate-400">Receipt Screenshot:</span>
                <button
                  type="button"
                  id="view-uploaded-screenshot-btn"
                  onClick={() => {
                    if (!screenshotUrl && displayScreenshotUrl) {
                      setScreenshotUrl(displayScreenshotUrl);
                    }
                    setIsReceiptPreviewOpen(true);
                  }}
                  className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer text-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Uploaded Screenshot</span>
                </button>
              </div>
            </div>

            {/* Amber Delivery Notice Box */}
            <div className="bg-[#1f160b] border border-amber-600/50 rounded-2xl p-4 text-xs sm:text-sm text-amber-200/90 flex items-start gap-3 shadow-md">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Your receipt has been delivered directly to Teacher Guduru's admin dashboard queue ({ADMIN_EMAIL}). You can also notify him directly to speed up verification.
              </p>
            </div>

            {/* Direct Forwarding Actions */}
            <div className="bg-[#111827]/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs sm:text-sm font-bold text-slate-100 text-center">
                Want immediate activation? Forward receipt details:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`https://wa.me/251953201048?text=${encodeURIComponent(`Hello Teacher Guduru Alemayehu, I have submitted my payment of ${displayAmount} ETB for Smart Study Tutorial.\n\nStudent Name: ${displayStudentName}\nPlan: ${displayPlanName}\nAmount: ETB ${displayAmount}\nPayment Channel: ${displayChannel}\n\nPlease inspect my screenshot and activate my semester access.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 sm:py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-950/40 transition-all"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Send on WhatsApp</span>
                </a>
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ADMIN_EMAIL)}&su=${encodeURIComponent(`Payment Receipt Verification - ${displayStudentName} (${displayAmount} ETB)`)}&body=${encodeURIComponent(`Hello Teacher Guduru Alemayehu,\n\nI have submitted my payment receipt for Smart Study Tutorial.\n\nStudent Name: ${displayStudentName}\nPlan: ${displayPlanName}\nAmount: ETB ${displayAmount}\nPayment Channel: ${displayChannel}\n\nPlease inspect in your Admin Dashboard and grant access.\nThank you!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 sm:py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-950/40 transition-all"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email Teacher Guduru</span>
                </a>
              </div>
            </div>

            {/* 2-Minute Countdown & Auto-Unlock Status */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-colors ${
              isAutoActivated || countdownSeconds === 0
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-indigo-950/40 border-indigo-500/30 text-slate-300'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  isAutoActivated || countdownSeconds === 0 ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                }`} />
                <span className="font-medium">
                  {isAutoActivated || countdownSeconds === 0
                    ? '✓ Full Semester Access Active & Ready!'
                    : 'Auto-Activating Access in 2 Minutes:'}
                </span>
              </div>
              <span className="font-mono font-extrabold text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/30 text-xs">
                {isAutoActivated || countdownSeconds === 0 ? 'Unlocked 🔓' : formatCountdown(countdownSeconds)}
              </span>
            </div>

            {/* Glowing Green Button: Start Practicing National Exam Questions Now */}
            <button
              type="button"
              id="start-practicing-now-btn"
              onClick={handleStartPracticingNow}
              className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 cursor-pointer transition-all border border-emerald-400/30"
            >
              <span>Start Practicing National Exam Questions Now</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Secondary Re-upload option */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowStatusView(false);
                  setIsSuccess(false);
                }}
                className="text-xs text-slate-400 hover:text-amber-300 underline font-medium cursor-pointer transition-colors"
              >
                ✏️ Need to upload a different screenshot or change details? Tap here
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Header with Official Payment Notice */}
            <div className="text-center mb-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Official Student Membership Fee & Access</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-white tracking-tight">
                Smart Study Semester Membership
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-lg mx-auto">
                Send <strong className="text-amber-400 font-bold">300 ETB for ONE SEMESTER</strong> to unlock full tutorial questions, video lessons, cheat sheets, and 24/7 AI tutor.
              </p>
            </div>

            {/* HIGHLIGHTED PAYMENT ACCOUNTS BOX */}
            <div className="bg-gradient-to-br from-indigo-950/70 via-slate-950 to-slate-900 border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 mb-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">Payment Accounts for Subscription Fee</h3>
                    <p className="text-[11px] text-slate-400">Account Holder: <strong className="text-amber-300">{PAYMENT_ACCOUNTS.accountHolder}</strong></p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                    300 ETB / SEMESTER
                  </span>
                </div>
              </div>

              {/* Accounts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                
                {/* Commercial Bank of Ethiopia (CBE) */}
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-purple-400 block flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      <span>CBE Bank Account</span>
                    </span>
                    <p className="font-mono text-sm sm:text-base font-extrabold text-white tracking-wider">
                      {PAYMENT_ACCOUNTS.cbeAccount}
                    </p>
                    <p className="text-[10px] text-slate-400">Commercial Bank of Ethiopia</p>
                  </div>

                  <button
                    onClick={() => handleCopy(PAYMENT_ACCOUNTS.cbeAccount, 'cbe')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs shrink-0 cursor-pointer"
                    title="Copy CBE Account Number"
                  >
                    {copiedItem === 'cbe' ? (
                      <CheckCheck className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span className="text-[10px]">{copiedItem === 'cbe' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Telebirr & E-Birr */}
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      <span>Telebirr & E-Birr</span>
                    </span>
                    <p className="font-mono text-sm sm:text-base font-extrabold text-emerald-300 tracking-wider">
                      {PAYMENT_ACCOUNTS.telebirrPhone}
                    </p>
                    <p className="text-[10px] text-slate-400">Send money via Telebirr / E-Birr app</p>
                  </div>

                  <button
                    onClick={() => handleCopy(PAYMENT_ACCOUNTS.telebirrPhone, 'phone')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs shrink-0 cursor-pointer"
                    title="Copy Phone Number"
                  >
                    {copiedItem === 'phone' ? (
                      <CheckCheck className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span className="text-[10px]">{copiedItem === 'phone' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Plans Selection Carousel */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {plans.map((plan) => {
                const isSelected = plan.id === selectedPlanId;
                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-xl p-2.5 sm:p-3 border transition-all cursor-pointer text-center relative ${
                      isSelected
                        ? 'bg-indigo-950/60 border-amber-500 ring-2 ring-amber-500/30'
                        : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/80'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2 right-2 text-[8px] uppercase font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950">
                        {plan.badge}
                      </span>
                    )}
                    <h4 className="font-bold text-xs text-white truncate">{plan.name}</h4>
                    <p className="text-base sm:text-lg font-extrabold text-amber-400 mt-0.5">
                      {plan.currency}{plan.price}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">{plan.billingCycle}</p>
                  </div>
                );
              })}
            </div>

            {/* Payment Verification Form */}
            <form onSubmit={handleCompleteSubscription} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3.5 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Confirm Your Payment & Activate Account:</span>
                <span className="text-xs text-emerald-400 font-bold">Total: ETB {finalPrice}</span>
              </div>

              {/* Choose Which Channel You Paid Through */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Where did you send the fee?</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentChannel('cbe')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1 transition-all ${
                      paymentChannel === 'cbe'
                        ? 'bg-purple-900/40 border-purple-500 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Building2 className="w-3 h-3 text-purple-400" />
                    <span>CBE Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentChannel('telebirr')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1 transition-all ${
                      paymentChannel === 'telebirr'
                        ? 'bg-emerald-900/40 border-emerald-500 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-3 h-3 text-emerald-400" />
                    <span>Telebirr</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentChannel('ebirr')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1 transition-all ${
                      paymentChannel === 'ebirr'
                        ? 'bg-emerald-900/40 border-emerald-500 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-3 h-3 text-sky-400" />
                    <span>E-Birr</span>
                  </button>
                </div>
              </div>

              {/* Payment Receipt Screenshot Upload (replaces reference number input) */}
              <div className="space-y-3 pt-1">
                <PaymentScreenshotUpload
                  screenshotUrl={screenshotUrl}
                  screenshotName={screenshotName}
                  screenshotSize={screenshotSize}
                  onScreenshotChange={(url, name, size) => {
                    setScreenshotUrl(url);
                    setScreenshotName(name);
                    setScreenshotSize(size);
                    setFormError('');
                  }}
                  onRemoveScreenshot={() => {
                    setScreenshotUrl('');
                    setScreenshotName('');
                    setScreenshotSize('');
                  }}
                  onPreviewClick={() => setIsReceiptPreviewOpen(true)}
                  required={true}
                />

                {/* Student Contact Information */}
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Student Full Name: <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={senderPhoneOrName}
                      onChange={(e) => {
                        setSenderPhoneOrName(e.target.value);
                        setFormError('');
                      }}
                      placeholder="e.g. Bare Cawe"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 placeholder-slate-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Phone Number: <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={senderPhone}
                        onChange={(e) => {
                          setSenderPhone(e.target.value);
                          setFormError('');
                        }}
                        placeholder="e.g. 0912345678"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 placeholder-slate-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Email Address: <span className="text-slate-500 text-[10px]">(Optional)</span>
                      </label>
                      <input
                        type="email"
                        value={senderEmail}
                        onChange={(e) => setSenderEmail(e.target.value)}
                        placeholder="e.g. barecawe@gmail.com"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 placeholder-slate-500"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Your name and phone number will be delivered directly with the screenshot to Admin <strong className="text-indigo-300">Guduru Alemayehu</strong> for verification.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/50 border border-rose-500/40 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Promo Code input */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      placeholder="Discount / Scholarship code (optional)"
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 uppercase font-mono focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors shrink-0 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>

                {appliedPromo && (
                  <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>Coupon <strong>{appliedPromo.code}</strong> applied ({appliedPromo.discountPercentage}% OFF)!</span>
                  </p>
                )}
                {promoError && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{promoError}</span>
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="complete-subscribe-btn"
                disabled={isProcessing}
                className="w-full py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div>
                    <span>Delivering Receipt to Admin Queue...</span>
                  </>
                ) : (
                  <>
                    <BadgeCheck className="w-4 h-4 text-slate-950" />
                    <span>Send Screenshot for Admin Verification (ETB {finalPrice})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {onFreePreviewContinue && (
              <button
                type="button"
                onClick={() => {
                  onFreePreviewContinue();
                  onClose();
                }}
                className="w-full py-1 text-center text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Explore Free Preview Practice & Video Lessons First
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Modal for student to preview their uploaded screenshot */}
      {isReceiptPreviewOpen && screenshotUrl && (
        <ReceiptViewerModal
          isOpen={isReceiptPreviewOpen}
          onClose={() => setIsReceiptPreviewOpen(false)}
          imageUrl={screenshotUrl}
          title="Your Uploaded Payment Screenshot"
          studentName={senderPhoneOrName || currentUser.name}
          studentEmail={currentUser.email}
          amount={finalPrice}
          paymentMethod={
            paymentChannel === 'cbe'
              ? 'CBE Bank (1000521750255)'
              : paymentChannel === 'telebirr'
              ? 'Telebirr (0953201048)'
              : 'E-Birr (0953201048)'
          }
        />
      )}
    </div>
  );
};
