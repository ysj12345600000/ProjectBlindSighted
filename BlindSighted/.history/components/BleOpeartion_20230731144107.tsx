import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback} from 'react';
import {Alert} from 'react-native';
import { Buffer } from 'buffer';
import {PermissionsAndroid, Platform} from 'react-native';
import {BleError,BleManager,Characteristic,Device, Service} from 'react-native-ble-plx';
import {PERMISSIONS, requestMultiple} from 'react-native-permissions';
import DeviceInfo from 'react-native-device-info';
import {DsitanceCalculateParams} from './triangulationCalculater';


type VoidCallback = (result: boolean) => void;
const manager = new BleManager();
let currentMacId = '';

interface DeviceCharacteristicData {
    macId: string;
    notifyCharacteristicUUID: string;
    deviceServiceId: string;
    writeCharacteristicUUID: string;
};

interface ResponseData{
    macId: string;
    context: string;
}


interface BleManagerContextProps {
    manager: BleManager;
    rssiLists: number[][];
    deviceList: Device[];
    targetMacIds: string[];
    setTargetMacIds: (macIds: string[]) => void;
    connectedDevices: Device[];
    isSearchBle: boolean;
    setAllowRssiScan: (allow: boolean) => void;
    allowScan: boolean;
    distanceCalculateParamsList: DsitanceCalculateParams[];
    setDistanceCalculateParamsList: (params: DsitanceCalculateParams[]) => void;
    

    requestPermissions: (cb: VoidCallback) => void;
    startSearchBle: () => void;
    stopSearchBle: () => void;
    connectBle: (macId: string) => void;
    disconnectBle: (macId: string) => void;
    bleWirte: (macId: string, data: string) => void;
    startNoticeBle: (macId: string) => void;
    getServiceID: (macId: string) => void;
    
  }
  
const BleManagerContext = createContext<BleManagerContextProps|null>({} as BleManagerContextProps);
  
export const useBleManager = () =>{
    const context = useContext(BleManagerContext);
    if (!context) {
      throw new Error('useBleManager must be used within a BleManagerContextProvider');
    }
    return context;
  }
  
interface BleManagerContextProviderProps {children: ReactNode;}

export const BleManagerContextProvider = ({ children }: BleManagerContextProviderProps) => {

    const [ isBleOpen, setIsBleOpen ] = useState(false);
    const [ deviceList, setDeviceList ] = useState<Device[]>([]); //扫描到的裝置列表
    const [ rssiLists, setRssiLists] = useState<number[][]>([[], [], []]);
    const [ targetMacIds, setTargetMacIds ] = useState<string[]>([]); //目標裝置的MAC ID
    const [ connectedDevices, setConnectedDevices ] = useState<Device[]>([]); //连接的设备
    const [ isSearchBle, setIsSearchBle ] = useState(false); //是否正在搜索蓝牙
    const [ isTogglingBle, setIsTogglingBle] = useState(false); //是否正在切换蓝牙状态
    const [ allowRssiScan, setAllowRssiScan ] = useState(false); //是否允许扫描蓝牙

    const [responseData, setResponseData] = useState<ResponseData>({macId: '', context: ''}); //接收到的数据
    let deviceCharacteristicDataList : DeviceCharacteristicData[] = [];
    const [ distanceCalculateParamsList, setDistanceCalculateParamsList ] = useState<DsitanceCalculateParams[]>([]);

    let MAXATTEMPTTIMES = 3;
    let RETRY_DELAY = 500;


    //初始化及获取权限
    useEffect(() => {
        const subscription = manager.onStateChange((state) => {
          if (state === 'PoweredOff') {
            setDeviceList([]);
            setConnectedDevices([]);          
            setIsBleOpen(false);
            Alert.alert('蓝牙已关闭, 请打开蓝牙设备');
          }
    
          if (state === 'PoweredOn') {
            setIsBleOpen(true);
          }
        }, true);
    
        return () => {
          subscription.remove();
        };
      }, [isBleOpen]);

    const requestPermissions = useCallback( async (cb: VoidCallback) => {
        if (Platform.OS === 'android') {
            const apiLevel = await DeviceInfo.getApiLevel();

            if (apiLevel < 31) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                title: 'Location Permission',
                message: 'Bluetooth Low Energy requires Location',
                buttonNeutral: 'Ask Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
                },
            );
            cb(granted === PermissionsAndroid.RESULTS.GRANTED);
            } else {
            const result = await requestMultiple([
                PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
                PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
                PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
            ]);

            const isGranted =
                result['android.permission.BLUETOOTH_CONNECT'] ===
                PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.BLUETOOTH_SCAN'] ===
                PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.ACCESS_FINE_LOCATION'] ===
                PermissionsAndroid.RESULTS.GRANTED;

            cb(isGranted);
            }
        } else {
            cb(true);
        }
    }, []);


    // 搜索蓝牙
    const isDuplicteDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex(device => nextDevice.id === device.id) > -1;

    useEffect(() => {
        if (isTogglingBle) return;
    
        if (isSearchBle) {
            setDeviceList([]);
    
            // 开始扫描
            manager.startDeviceScan(null, null, (error, device) => {
                if (error) {
                    console.error(error);
                    return;
                }
    
                if (device && device.name) {
                    setDeviceList((prevState: Device[]) => {
                        if (!isDuplicteDevice(prevState, device)) {
                            const newState = [...prevState, device];
                            console.log('扫描到设备', device, deviceList);
                            return newState;
                        }
                        return prevState;
                    });
                }
            });
        } else {
            manager.stopDeviceScan();
        }
    }, [isSearchBle]);
    

    const startSearchBle = () => {
        if(connectedDevices.length == 3) return;
        console.log('开始搜索蓝牙');
        setIsSearchBle(true);
    };
    
    const stopSearchBle = () => {
        console.log('停止搜索蓝牙');
        setIsSearchBle(false);
    };

    //连接蓝牙
    
    const connectBle = async (macId: string) => {
        stopSearchBle();// 停止搜索蓝牙
    
        if (connectedDevices.some(device => device.id === macId)) {
            console.log('该设备已连接', deviceList.filter(device => targetMacIds.includes(device.id)));
            startSearchBle;  // 开始搜索蓝牙
            return;
        }
    
        console.log('开始连接', deviceList.find(device => device.id === macId)?.name);
        console.log('当前连接设备', connectedDevices);
    
        try {
            const device = await manager.connectToDevice(macId, { autoConnect: true, requestMTU: 512 });
    
            setConnectedDevices(prevDevices => {
                if (prevDevices.some(d => d.id === device.id)) {
                    console.log('该设备已连接', device.name);
                    return prevDevices;
                }
                if (prevDevices.length >= 3) {
                    console.log('已连接3个设备', prevDevices);
                    return prevDevices;
                }
                let currentConnectedDevices = [...prevDevices, device];
                if (currentConnectedDevices.length>1) {
                    currentConnectedDevices = sortDevicesByNumber(currentConnectedDevices);
                }
                return currentConnectedDevices;
            });
    
            onDisconnect(device.id);
            console.log('连接成功', device.name);

            await manager.discoverAllServicesAndCharacteristicsForDevice(macId);
            // 获取服务
            const parts = device.name!.split('_');
            const numberPart = parts[parts.length - 1];
            if(numberPart === '1'){
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                    await getServiceID(macId);
                    await startNoticeBle(macId);
                    await bleWirte(macId, 'GETDEVICEINFO');
                })();
            }

        } catch (error) {
            console.error('连接失败', error);
        } finally {
            startSearchBle();  // 开始搜索蓝牙
        }
    };

    // 设备排序
    const extractNumberFromDeviceName = (deviceName: string): number => {
        const parts = deviceName.split('_');
        const numberPart = parts[parts.length - 1];
        return parseInt(numberPart, 10);
    }
    
    // 使用sort()方法按序号对设备进行排序
    const sortDevicesByNumber = (devices: Device[]): Device[] => {
        return [...devices].sort((a, b) => {
            const numberA = extractNumberFromDeviceName(a.name || "");
            const numberB = extractNumberFromDeviceName(b.name || "");
            return numberA - numberB; // 升序排序
        });
    }

    useEffect(() => {
        if (allowRssiScan){
            if (connectedDevices.length === 3) {
                console.log('三个设备已连接', connectedDevices);
                stopSearchBle();

                const sortedDevices = sortDevicesByNumber(connectedDevices);
                setConnectedDevices(sortedDevices);
            }
        }
}, [connectedDevices]);

    //断开蓝牙
    const disconnectBle = async (macId:string) => {
        if(!connectedDevices.some(device => device.id === macId)) {
            console.log('该设备未连接');
            return;
        }

        manager.cancelDeviceConnection(macId).then((res) => {
            console.log('断开连接成功', res);
            // 从已连接设备列表中移除
            setConnectedDevices(prevDevices => prevDevices.filter(device => device.id !== macId));
          }).catch((err) => {
            console.error('断开连接失败', err);
        });
    };

    //监听连接情况
    const onDisconnect = (macId: string) => {
        const subscription = manager.onDeviceDisconnected(macId, (error, device) => {
          if (error) {
            console.log('设备断开监听失败', error);
          } else {
            console.log('设备断开监听成功', device);
            // 从已连接设备列表中移除
            setConnectedDevices(prevDevices => prevDevices.filter(d => d.id !== macId));
          }
        });
        return () => {
          subscription.remove();
        };
    };

    // 监听蓝牙信号强度

    useEffect(() => {
        let isCancelled = false;
    
        const recursiveScan = async () => {
            if (!allowRssiScan || isCancelled) return;
            await getRSSIList();
            if (!isCancelled) recursiveScan();
        };
    
        if (allowRssiScan) {
            recursiveScan();
        }
    
        return () => {
            isCancelled = true;
        };
    }, [allowRssiScan, connectedDevices]);

    const addRssiToList = (deviceName: string, rssi: number) => {
        // 从macId中获取末尾的数字
        const index = parseInt(deviceName.split('_').pop() || "0", 10) - 1;
    
        // 确保索引是有效的
        if (index >= 0 && index < 3) {
            setRssiLists((prevState: number[][]) => {
                const newList = [...prevState[index], rssi].slice(-50);
                
                // console.log(`第${index+1}个设备`, newList, deviceName);
                // 使用map函数创建一个新的数组，其中index位置的数组被替换为新的列表
                return prevState.map((list, idx) => idx === index ? newList : list);
            });
        }
    };

    const getRSSIList = async () => {
        if (!connectedDevices.length) return;
    
        for (const device of connectedDevices){
            try{
                const DeviceForRSSI = await device.readRSSI();
                addRssiToList(device.name!, DeviceForRSSI.rssi!);
            } catch (error) {
                console.error('获取RSSI失败', error);
            }
        }
    };

    // 设备通讯
    const getDeviceCharacteristicData =  (macId: string): DeviceCharacteristicData => {
        return  deviceCharacteristicDataList.find(data => data.macId === macId)!;
    };

    const getServiceID = async (macId : string) => {
        try{
          const services = await manager.servicesForDevice(macId);
          console.log('获取服务成功', services);
          let serviceUUID = services[2].uuid;
          return await getCharacterIdNotify(serviceUUID, macId);
        } catch(error){
          console.error('获取服务失败', error);
        }
    };
     
    const getCharacterIdNotify = async (serviceUUID : string, macId : string) => {
        try{
          // 检查设备是否仍然连接
            const device = await manager.isDeviceConnected(macId!);
            if (!device) {
                console.log('设备已断开');
                return null;
            }
        
            const characteristics = await manager.characteristicsForDevice(macId!, serviceUUID);
            console.log('获取特征值成功', characteristics);
            if (characteristics.length < 2) {
                console.error("Expected at least 2 characteristics, but got less.");
                return null;
            }
          const deviceCharacteristicData = {
            macId: macId!,
            notifyCharacteristicUUID: characteristics[0].uuid,
            deviceServiceId: characteristics[1].serviceUUID,
            writeCharacteristicUUID: characteristics[1].uuid,
          }

            deviceCharacteristicDataList = deviceCharacteristicDataList.filter(data => data.macId !== macId);
            deviceCharacteristicDataList.push(deviceCharacteristicData);
            console.log('特征值列表', deviceCharacteristicDataList);
            return deviceCharacteristicDataList;

          
        } catch(error){
          console.log('获取特征值失败', error);
          return null;
        }
    };

    const  startNoticeBle = async (macId : string) => {
        const deviceCharacteristicData = getDeviceCharacteristicData(macId);
        if (!deviceCharacteristicData) {console.log('请先连接设备', macId); return};

        manager.monitorCharacteristicForDevice(deviceCharacteristicData.macId!, deviceCharacteristicData.deviceServiceId!, deviceCharacteristicData.notifyCharacteristicUUID!, (error, characteristic) => {
            if (error) {
              console.log('监听失败', error);
              return;
            }
            if (characteristic) {
                let rescontext = Buffer.from(characteristic.value!, 'base64').toString('utf8');
                if (rescontext.includes('DEVICEINFO:')) {
                    decodeFormatMessage2DsitanceCalculateParams(macId, rescontext);
                }
                let resData = {macId: macId, context: rescontext};
                console.log('监听成功', resData);
                setResponseData(resData);
            }
          }, 'monitor');

    }

    const decodeFormatMessage2DsitanceCalculateParams = (macId : string, rescontext: string) => {
        let deviceInfoList = rescontext.split(':');
                    let deviceInfo = deviceInfoList[deviceInfoList.length - 1].split(',');
                    console.log('设备信息', deviceInfo);
                    const dsitanceCalculateParams: DsitanceCalculateParams = {
                        macId: macId, 
                        deviceName: deviceInfo[11],
                        rssiRef: parseFloat(deviceInfo[4]),
                        rssiList: [],
                        position: [parseFloat(deviceInfo[0]), parseFloat(deviceInfo[1]), parseFloat(deviceInfo[2])],
                        x: 0, 
                        A: parseFloat(deviceInfo[5]),
                        H: parseFloat(deviceInfo[6]),
                        N: parseFloat(deviceInfo[7]),
                        P: parseFloat(deviceInfo[8]),
                        Q: parseFloat(deviceInfo[9]),
                        R: parseFloat(deviceInfo[10]),
                        distance: -1,
                        angle: parseFloat(deviceInfo[3])
                    };

                    console.log('计算参数', dsitanceCalculateParams);
                
                    setDistanceCalculateParamsList(prevParams => [...prevParams, dsitanceCalculateParams]);
    };

    const bleWirte = async (macId : string, data : string) => {
        const deviceCharacteristicData = getDeviceCharacteristicData(macId);

        if (!deviceCharacteristicData) {console.log('请先连接设备', macId); return};

        console.log('开始写入蓝牙', deviceCharacteristicData);
        let formatData = Buffer.from(data, 'utf8').toString('base64');

        manager.writeCharacteristicWithResponseForDevice(macId, deviceCharacteristicData.deviceServiceId!, deviceCharacteristicData.writeCharacteristicUUID!, formatData).then((characteristic)=>{

            let resData = Buffer.from(characteristic.value!, 'base64').toString('utf8');
            console.log('写入成功', resData);
          }).catch((err)=>{ 
            console.log('写入失败', err); 
        })
    };

    // 自动化程序

    // 当设备列表更新时，自动连接设备
    useEffect(() => {
        const connectDevices = async () => {
            if (deviceList.length === 0 || targetMacIds.length === 0) return;

            const matchingDevices = deviceList.filter(device => targetMacIds.includes(device.id));

            for (const device of matchingDevices) {
                await connectBle(device.id);
            }
        };
    connectDevices();
  }, [deviceList]);

    // 当组件加载时请求蓝牙权限
    useEffect(() => {
        setTargetMacIds(['34:85:18:6E:5B:19','34:85:18:42:4E:39','34:85:18:6E:D4:C5'])
        requestPermissions((granted: boolean) => {
          if (!granted) {
            Alert.alert('Permission Required', 'This app needs bluetooth permissions to function properly');
          }
        });
      }, [requestPermissions]);





    const value = {
        manager,
        rssiLists,
        deviceList,
        targetMacIds,
        connectedDevices,
        isSearchBle,
        setTargetMacIds,
        allowScan: allowRssiScan,
        setAllowRssiScan,
        distanceCalculateParamsList,
        setDistanceCalculateParamsList,


        requestPermissions,
        startSearchBle,
        stopSearchBle,
        connectBle,
        disconnectBle,
        getRSSIList,
        bleWirte,
        startNoticeBle,
        getServiceID,
        

    };
    return <BleManagerContext.Provider value={value}>{children}</BleManagerContext.Provider>;
}
export default useBleManager;









